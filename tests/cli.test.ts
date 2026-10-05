/**
 * The two surfaces, now that Slipway builds both from ALL_TOOLS.
 *
 * Parsing, help and the exit-code contract are Slipway's and tested there. What
 * matters here: every tool arrives on both surfaces intact, 1.1's library
 * switch still removes the library tools, the one write still asks first,
 * Apple's errors keep their exit codes, and the docs stay in step with the code.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXIT } from "@thenavidm/slipway";
import { checkApp, cli, connect } from "@thenavidm/slipway/testing";
import { LibraryError, NotFoundError, RateLimitError, ReporterError, ServerError, ValidationError, errorFor } from "../src/api/errors.js";
import { app } from "../src/app.js";
import { ALL_TOOLS } from "../src/tools/index.js";
import { toSlipway } from "../src/tools/kit.js";

/** Nothing here may read the real library: the path cannot exist. */
const env = { APPLE_PODCASTS_LIBRARY_PATH: "/nonexistent/apple-podcasts-mcp-test.sqlite" };
afterEach(() => vi.unstubAllEnvs());

const LIBRARY = ["list_subscriptions", "search_library", "list_recent_episodes", "list_saved_episodes", "get_library_episode", "library_stats", "export_subscriptions"];

describe("Apple Podcasts on Slipway", () => {
  it("offers every tool as a command and over MCP, under the same names", async () => {
    const list = await cli(app, [], { env });
    for (const tool of ALL_TOOLS) expect(list.stdout).toContain(tool.command);
    const mcp = await connect(app, { env });
    const names = (await mcp.listTools()).map((tool) => tool.name).sort();
    await mcp.close();
    expect(names).toEqual(ALL_TOOLS.map((tool) => tool.name).sort());
  });

  it("removes the seven library tools with APPLE_PODCASTS_LIBRARY=0, as 1.1 did", async () => {
    for (const off of ["0", "false", "no"]) {
      const mcp = await connect(app, { env: { ...env, APPLE_PODCASTS_LIBRARY: off } });
      const names = (await mcp.listTools()).map((tool) => tool.name);
      await mcp.close();
      expect(names.length).toBe(ALL_TOOLS.length - LIBRARY.length);
      for (const name of LIBRARY) expect(names).not.toContain(name);
    }
    const on = await connect(app, { env: { ...env, APPLE_PODCASTS_LIBRARY: "1" } });
    expect((await on.listTools()).length).toBe(ALL_TOOLS.length);
    await on.close();
  });

  it("marks only the library tools as never leaving this Mac", async () => {
    const mcp = await connect(app, { env });
    const tools = await mcp.listTools();
    await mcp.close();
    const closed = tools.filter((tool) => tool.annotations?.openWorldHint === false).map((tool) => tool.name);
    expect(closed.sort()).toEqual([...LIBRARY].sort());
  });

  it("refuses the export without --confirm, naming the path, before anything is written", async () => {
    const run = await cli(app, ["export-subscriptions", "--path", "/tmp/never-written.opml"], { env });
    expect(run.code).toBe(2);
    const error = JSON.parse(run.stderr);
    expect(error.code).toBe("refused");
    expect(error.error).toContain("--confirm");
    expect(error.error).toContain("/tmp/never-written.opml");
    expect(error.error).toContain("overwrites whatever is already at that path");
  });

  it("hides the export in read-only mode and refuses it with destructive writes off", async () => {
    const mcp = await connect(app, { env: { ...env, APPLE_PODCASTS_READ_ONLY: "1" } });
    const names = (await mcp.listTools()).map((tool) => tool.name);
    await mcp.close();
    expect(names).not.toContain("export_subscriptions");
    expect(names).toContain("search_podcasts");
    const off = { ...env, APPLE_PODCASTS_ALLOW_DESTRUCTIVE: "0" };
    expect((await cli(app, ["export-subscriptions", "--path", "/tmp/x.opml", "--confirm", "--dry-run"], { env: off })).code).toBe(2);
  });

  it("finds the tool for the words people type about rankings and reviews", async () => {
    const first = async (words: string[]) => (await cli(app, ["which", ...words], { env })).stdout.trim().split("\n")[0];
    expect(await first(["where", "does", "a", "show", "rank"])).toContain("find-chart-position");
    expect(await first(["how", "is", "this", "show", "rated"])).toContain("get-reviews");
  });

  it("says there is nothing to sign in to", async () => {
    const run = await cli(app, ["login"], { env });
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("nothing to sign in to");
  });

  it("passes slipway check", async () => {
    const report = await checkApp(app, { env });
    expect(report.findings.filter((finding) => finding.level === "error")).toEqual([]);
  });
});

describe("Apple's errors keep their exit codes and their details", () => {
  it("calls Apple's 403 a rate limit, as 1.1 did, not a credential problem", () => {
    const error = toSlipway(errorFor(403, "/search", "<html>Forbidden</html>"));
    expect(error).toBeInstanceOf(Error);
    expect(error.exitCode).toBe(EXIT.rateLimited);
    expect(error.details).toMatchObject({ endpoint: "/search", surface: "apple" });
  });

  it.each([
    ["a missing show", new NotFoundError("Not found.", 200, "/lookup"), EXIT.notFound],
    ["an argument Apple rejects", new ValidationError("Apple rejected the request.", 400, "/search"), EXIT.usage],
    ["Apple's own failure", new ServerError("Apple returned 503.", 503, "/search"), EXIT.api],
    ["a rejected Reporter token", new ReporterError("Apple Podcasts Connect rejected the access token.", 401), EXIT.auth],
    ["Reporter not configured", new ReporterError("Apple Podcasts Connect is not configured.", 0), EXIT.notConfigured],
    ["a library macOS will not open", new LibraryError("macOS refused access to the Apple Podcasts library."), EXIT.api],
    ["a rate limit by class", new RateLimitError("Apple is rate limiting this IP address on /search.", 403, "/search"), EXIT.rateLimited],
  ])("%s", (_name, raw, code) => {
    expect(toSlipway(raw).exitCode).toBe(code);
  });
});

describe("documentation stays in step with the code", () => {
  const read = (p: string): string => readFileSync(new URL(p, import.meta.url), "utf-8");
  const names = (text: string): Set<string> => new Set((text.match(/APPLE_PODCASTS_[A-Z_]+/g) ?? []).filter((name) => !name.endsWith("_")));
  const source = (dir: string): string =>
    readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })
      .map((entry) => (entry.isDirectory() ? source(`${dir}${entry.name}/`) : entry.name.endsWith(".ts") ? read(`${dir}${entry.name}`) : ""))
      .join("\n");

  /** Every variable the server reads: this repo's code, and Slipway's as agent-context lists them. */
  const used = async (): Promise<Set<string>> => {
    const context = JSON.parse((await cli(app, ["agent-context"], { env })).stdout);
    return new Set([...names(source("../src/")), ...context.settings.map((setting: { env: string }) => setting.env)]);
  };

  it("documents every environment variable the code reads", async () => {
    const documented = names(read("../README.md"));
    expect([...(await used())].filter((v) => !documented.has(v))).toEqual([]);
  });

  it("lists every environment variable in --help", async () => {
    const help = (await cli(app, ["--help"], { env })).stdout;
    // The help groups the HTTP ones as `APPLE_PODCASTS_HTTP_PORT / _HOST / _TOKEN / _ALLOWED_ORIGINS`.
    const shorthand = new Set(["APPLE_PODCASTS_HTTP_HOST", "APPLE_PODCASTS_HTTP_TOKEN", "APPLE_PODCASTS_HTTP_ALLOWED_ORIGINS"]);
    expect([...(await used())].filter((v) => !help.includes(v) && !shorthand.has(v))).toEqual([]);
  });

  it.each(["../README.md", "../INSTALL.md"])("has no dead in-page anchors in %s", (file) => {
    if (!existsSync(new URL(file, import.meta.url))) return; // repo may ship one doc
    const md = read(file).replace(/```[\s\S]*?```/g, "");
    // GitHub's slug keeps letters, marks, numbers and connector punctuation, so an
    // emoji's variation selector (U+FE0F) stays in the anchor and a link has to carry it.
    const slugs = new Set(
      [...md.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) =>
        (heading as string).trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\s-]/gu, "").replace(/ /g, "-"),
      ),
    );
    const dead = [...md.matchAll(/\[[^\]]+\]\(#([^)]+)\)/g)]
      .map((m) => decodeURIComponent(m[1] as string))
      .filter((a) => !slugs.has(a));
    expect(dead).toEqual([]);
  });
});
