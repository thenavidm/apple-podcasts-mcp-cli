/**
 * Shared plumbing every tool uses, now on Slipway.
 *
 * Tool modules keep describing themselves with a Zod shape, a risk, the source
 * they reach and a handler. This adapter turns each into a Slipway tool, so the
 * MCP server, the CLI, the write guard, annotations and errors all come from
 * the framework instead of a copy kept in this repo.
 *
 * The one piece of real logic here is still which of the four sources a tool
 * reaches. The library tools carry the `library` toolset, which
 * `APPLE_PODCASTS_LIBRARY=0` turns off, and are marked closed-world, because
 * they read a database on this Mac rather than anything on the internet.
 */

import {
  ApiError,
  NotFoundError as SlipwayNotFoundError,
  RateLimitError as SlipwayRateLimitError,
  SlipwayError,
  TimeoutError as SlipwayTimeoutError,
  UsageError,
  httpError,
  toSlipwayError,
  toolkit,
  z,
  type Risk,
  type Tool,
} from "@thenavidm/slipway";
import { AppleError, NotFoundError, RateLimitError, TimeoutError, ValidationError } from "../api/errors.js";
import { normalizeStorefront, type Config } from "../config.js";
import type { Clients } from "../clients.js";

/** Which of Apple's sources a tool reaches. */
export type Surface =
  /** itunes.apple.com, the charts host, the reviews RSS, or a podcast's feed. */
  | "public"
  /** The Apple Podcasts database on this Mac. */
  | "library"
  /** Apple Podcasts Connect, via the Reporter protocol. */
  | "reporter";

export type ToolContext = {
  clients: Clients;
  config: Config;
  /** Resolve the storefront a call acts in, defaulting from config. */
  storefront: (hint?: string) => string;
};

const kit = toolkit<ToolContext>();

/** The optional storefront argument, on every tool that reads Apple's catalog. */
export const storefrontArg = {
  storefront: z
    .string()
    .optional()
    .describe(
      "Two-letter country code for the Apple storefront to read, such as us, gb, se or de. Apple's catalog, charts and reviews are all per country and they differ, so this changes the answer rather than just the language. Defaults to APPLE_PODCASTS_STOREFRONT, which is us unless configured otherwise.",
    ),
};

/**
 * Kept so tool modules read the same, but never sent: Slipway adds `confirm`
 * to the one tool that writes a file, with one description everywhere.
 */
export const confirmArg = {
  confirm: z.boolean().optional(),
};

export const limitArg = (max: number, note: string) => ({
  limit: z.number().int().min(1).max(max).optional().describe(`How many to return, 1-${max}. ${note}`),
});

/** Anything a tool takes that names a show, in the shapes people actually have. */
export const showArg = {
  show: z
    .string()
    .describe(
      "The show, as an Apple Podcasts numeric id (1469759170), or a full Apple Podcasts URL, which is what someone pasting a link will have. A URL carrying a storefront in its path sets the storefront for the call unless one is passed explicitly.",
    ),
};

type Shape = Record<string, z.ZodType>;

export type ToolSpec<S extends Shape> = {
  name: string;
  /** One line, imperative. Shown in tool pickers. */
  title: string;
  description: string;
  schema: S;
  risk: Risk;
  surface: Surface;
  /** True when calling twice has the same effect as calling once. */
  idempotent?: boolean;
  handler: (args: z.infer<z.ZodObject<S>>, ctx: ToolContext) => Promise<unknown>;
  /** One line for the audit log and the confirm message, when this writes. */
  summary?: (args: z.infer<z.ZodObject<S>>) => string;
};

export type AnyToolSpec = Tool<ToolContext>;

/**
 * Apple's classes pick the exit code where its status cannot: Apple throttles
 * with a 403, which is a rate limit and not a credential, and answers a missing
 * show with 200 and an empty result. Everything else goes by status, then by
 * what the message says, and a failure with neither is upstream, exit 5, as in
 * 1.1. The endpoint, the source and Apple's own words ride along in `details`.
 */
export function toSlipway(error: AppleError): SlipwayError {
  const options = {
    cause: error,
    ...(error.status ? { status: error.status } : {}),
    details: { endpoint: error.endpoint, surface: error.surface, ...(error.detail ? { detail: error.detail } : {}) },
  };
  const known =
    error instanceof RateLimitError
      ? new SlipwayRateLimitError(error.message)
      : error instanceof NotFoundError
        ? new SlipwayNotFoundError(error.message)
        : error instanceof ValidationError
          ? new UsageError(error.message)
          : error instanceof TimeoutError
            ? new SlipwayTimeoutError(error.message)
            : error.status >= 400
              ? httpError(error.status, error.message)
              : toSlipwayError(new Error(error.message));
  const code = known.code === "internal" ? new ApiError(error.message) : known;
  return new SlipwayError(code.message, code.code, code.exitCode, { ...(code.hint ? { hint: code.hint } : {}), ...options });
}

export function defineTool<S extends Shape>(spec: ToolSpec<S>): Tool<ToolContext> {
  const { confirm: _confirm, ...shape } = spec.schema as Shape;
  const handler = spec.handler as (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
  return kit.defineTool({
    name: spec.name,
    title: spec.title,
    description: spec.description,
    input: z.object(shape),
    risk: spec.risk,
    // The library is a database on this Mac, not the open internet.
    openWorld: spec.surface !== "library",
    ...(spec.surface === "library" ? { tags: ["library"] } : {}),
    ...(spec.risk === "destructive" ? { consequence: "writes a file and overwrites whatever is already at that path" } : {}),
    ...(spec.idempotent !== undefined ? { idempotent: spec.idempotent } : {}),
    ...(spec.summary ? { summary: spec.summary as (args: Record<string, unknown>) => string } : {}),
    handler: async (args, ctx) => {
      try {
        return await handler(args, ctx);
      } catch (error) {
        throw error instanceof AppleError ? toSlipway(error) : error;
      }
    },
  });
}

export function makeContext(clients: Clients, config: Config): ToolContext {
  return {
    clients,
    config,
    storefront: (hint?: string) => (hint ? normalizeStorefront(hint) : config.storefront),
  };
}

/** Clamp a caller-supplied limit into a range the upstream will accept. */
export function clamp(value: number | undefined, fallback: number, max = 100): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), max);
}

/** Trim a summary to one readable line for the audit log. */
export function snippet(text: string | undefined, length = 60): string {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}
