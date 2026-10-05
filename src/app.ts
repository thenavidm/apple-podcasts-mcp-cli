/**
 * The Apple Podcasts app: everything Slipway needs to ship the MCP server and the CLI.
 *
 * This file only describes. It never starts anything, so `slipway check` and
 * tests can import it; `index.ts` is what runs.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { slipway } from "@thenavidm/slipway";
import { makeClients } from "./clients.js";
import { hasReporterCredentials, loadConfig } from "./config.js";
import { doctor } from "./doctor.js";
import { INSTRUCTIONS, PROMPTS, RESOURCES } from "./guide.js";
import { ALL_TOOLS } from "./tools/index.js";
import { makeContext, type ToolContext } from "./tools/kit.js";

const require = createRequire(import.meta.url);
export const VERSION: string = (require("../package.json") as { version: string }).version;

/** APPLE_PODCASTS_LIBRARY reads as 1.1 read it: unset is on, and anything but 1, true, yes or on is off. */
function libraryOn(env: NodeJS.ProcessEnv): boolean {
  const raw = env.APPLE_PODCASTS_LIBRARY;
  return raw === undefined || raw === "" || /^(1|true|yes|on)$/i.test(raw.trim());
}

export const app = slipway<ToolContext>({
  name: "apple-podcasts",
  title: "Apple Podcasts",
  version: VERSION,
  package: "@thenavidm/apple-podcasts-mcp-cli",
  description: "the Apple Podcasts catalog, charts, reviews and feeds, your own library on this Mac, and Apple Podcasts Connect analytics",
  instructions: INSTRUCTIONS,
  // Most of it needs nothing configured: the catalog, charts, reviews and feeds are open, and the library is read off this Mac.
  context: () => {
    const config = loadConfig();
    return makeContext(makeClients(config), config);
  },
  secrets: (ctx) => [ctx.config.reporterToken],
  tools: ALL_TOOLS,
  // The words people use for reviews and rankings, which the tools call reviews, charts and positions.
  synonyms: {
    say: ["reviews"],
    think: ["reviews"],
    complain: ["reviews"],
    complaints: ["reviews"],
    opinions: ["reviews"],
    ratings: ["reviews", "rating"],
    stars: ["reviews", "rating"],
    rated: ["reviews", "rating"],
    top: ["chart"],
    rank: ["chart", "position"],
    ranks: ["chart", "position"],
    ranking: ["chart", "position"],
    heard: ["search", "library", "transcripts"],
    following: ["subscriptions"],
    follow: ["subscriptions"],
  },
  toolsets: { library: "your Apple Podcasts library on this Mac" },
  // 1.1's switch for the library tools keeps working: off, the library toolset is off.
  defaults: { toolsets: (env) => (libraryOn(env) ? "all" : []) },
  httpPort: 8788,
  resources: [
    {
      name: "apple-podcasts-status",
      uri: "apple-podcasts://status",
      mimeType: "application/json",
      read: ({ config }) => ({
        catalog: true,
        charts_and_reviews: true,
        library: config.libraryEnabled && existsSync(config.libraryPath),
        library_enabled: config.libraryEnabled,
        analytics: hasReporterCredentials(config),
        storefront: config.storefront,
        storefront_sweep: config.storefronts,
        read_only: config.readOnly,
      }),
    },
    ...RESOURCES.map((resource) => ({ name: resource.name, uri: resource.uri, mimeType: resource.mimeType, read: () => resource.text })),
  ],
  prompts: PROMPTS.map((prompt) => ({ name: prompt.name, description: prompt.description, render: () => prompt.text })),
  doctor,
  // A rate limit, a storefront Apple does not serve and a library macOS will not open all fail alike from a tool call, so doctor probes each source every time, as 1.1 did.
  doctorNetwork: true,
  login:
    "There is nothing to sign in to. The catalog, charts, reviews and feeds are open, and the library is read off this Mac. Analytics for a show you own needs APPLE_PODCASTS_VENDOR_NUMBER and APPLE_PODCASTS_REPORTER_TOKEN from Apple Podcasts Connect; `doctor` says where to find both.",
  settings: [
    { env: "APPLE_PODCASTS_STOREFRONT", description: "Two-letter country code. Defaults to us; the catalog, charts and reviews all differ by country." },
    { env: "APPLE_PODCASTS_STOREFRONTS", description: "Comma-separated markets the cross-market tools sweep." },
    { env: "APPLE_PODCASTS_LIBRARY", description: "0 removes the local-library tools from the list." },
    { env: "APPLE_PODCASTS_LIBRARY_PATH", description: "Where the Podcasts database is, if not the default." },
    { env: "APPLE_PODCASTS_VENDOR_NUMBER", description: "Vendor number from Apple Podcasts Connect, for analytics on a show you own." },
    { env: "APPLE_PODCASTS_REPORTER_TOKEN", description: "Reporter access token from Apple Podcasts Connect; expires after 180 days.", secret: true },
    { env: "APPLE_PODCASTS_CACHE_TTL_MS", description: "How long a fetched chart stays reusable. Defaults to 300000.", tuning: true },
    { env: "APPLE_PODCASTS_REQUEST_TIMEOUT_MS", description: "Per-request deadline. Defaults to 30000.", tuning: true },
    { env: "APPLE_PODCASTS_MIN_REQUEST_INTERVAL_MS", description: "Spacing between requests. Defaults to 220.", tuning: true },
    { env: "APPLE_PODCASTS_MAX_RETRIES", description: "Retries on rate limits and 5xx. Defaults to 3.", tuning: true },
    { env: "APPLE_PODCASTS_USER_AGENT", description: "The User-Agent sent to Apple.", tuning: true },
    { env: "APPLE_PODCASTS_ITUNES_HOST", description: "The Search API host, for testing.", tuning: true },
    { env: "APPLE_PODCASTS_CHARTS_HOST", description: "The charts host, for testing.", tuning: true },
    { env: "APPLE_PODCASTS_REPORTER_HOST", description: "The Reporter host, for testing.", tuning: true },
  ],
  links: { repository: "https://github.com/thenavidm/apple-podcasts-mcp-cli" },
});
