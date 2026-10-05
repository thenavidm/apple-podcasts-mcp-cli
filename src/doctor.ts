/**
 * `apple-podcasts-cli doctor`: what is actually broken.
 *
 * Integrations fail for about six reasons and all of them look identical from
 * inside an MCP client, which reports "the tool errored" and nothing else. This
 * probes each of the four sources separately, so the answer is "the library
 * needs Full Disk Access" rather than "something went wrong". Slipway runs it
 * on every `doctor`, as 1.1 did, after its own checks.
 *
 * Two probes here earn their place because they test assumptions this server
 * makes but cannot guarantee.
 *
 * The library probe reads the actual columns rather than only opening the file.
 * The schema is Apple's private Core Data store and it changes between releases
 * of the Podcasts app, so a database that opens fine can still be missing the
 * transcript column this server's best feature depends on. Finding that out
 * here beats finding it out through an empty search result.
 *
 * The rate-limit probe is deliberately a single request. Checking a rate limit
 * by exercising it would be the one diagnostic that causes the fault it is
 * looking for.
 */

import { existsSync } from "node:fs";
import type { DoctorCheck } from "@thenavidm/slipway";
import { hasReporterCredentials, type Config } from "./config.js";
import { openDatabase } from "./library/db.js";
import type { ToolContext } from "./tools/kit.js";

export async function doctor(ctx: ToolContext, options: { network: boolean }): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  if (options.network) {
    checks.push(...(await checkCatalog(ctx)), await checkCharts(ctx), await checkReviews(ctx));
  }
  checks.push(...(await checkLibrary(ctx.config)));
  checks.push(...(await checkAnalytics(ctx, options.network)));
  return checks;
}

const warning = (name: string, detail: string, fix?: string): DoctorCheck => ({ name, ok: false, warn: true, detail, ...(fix ? { fix } : {}) });

async function checkCatalog({ clients, config }: ToolContext): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const name = `Apple catalog (${config.storefront})`;
  try {
    const rows = await clients.itunes.search({ term: "the daily", entity: "podcast", storefront: config.storefront, limit: 1 });
    checks.push(
      rows.length
        ? { name, ok: true, detail: `reachable; search returned "${rows[0]?.collectionName ?? "a result"}"` }
        : warning(name, "reachable, but the test search returned nothing, which is unexpected for this storefront"),
    );
  } catch (error) {
    const message = (error as Error).message;
    checks.push({
      name,
      ok: false,
      detail: message,
      ...(/rate limit/i.test(message) ? { fix: "Apple allows roughly 20 requests a minute per IP. Wait a minute and run doctor again." } : {}),
    });
  }

  try {
    const tree = await clients.itunes.genres(config.storefront);
    checks.push(
      tree?.subgenres.length
        ? { name: "Genre tree", ok: true, detail: `${tree.subgenres.length} top-level podcast genres` }
        : warning("Genre tree", `Apple returned no genre tree for storefront "${config.storefront}"`),
    );
  } catch (error) {
    checks.push(warning("Genre tree", (error as Error).message));
  }
  return checks;
}

async function checkCharts({ clients, config }: ToolContext): Promise<DoctorCheck> {
  const name = `Charts (${config.storefront})`;
  try {
    const chart = await clients.charts.chart({ storefront: config.storefront, kind: "podcasts", limit: 5 });
    return chart.entries.length
      ? { name, ok: true, detail: `Top Shows reachable; number 1 is "${chart.entries[0]?.name}", updated ${chart.updated ?? "at an unknown time"}` }
      : warning(name, `the chart came back empty, which usually means "${config.storefront}" is not a storefront Apple operates`);
  } catch (error) {
    return { name, ok: false, detail: (error as Error).message };
  }
}

async function checkReviews({ clients, config }: ToolContext): Promise<DoctorCheck> {
  const name = `Reviews (${config.storefront})`;
  try {
    // The New York Times' The Daily. A show that exists in every storefront and
    // has reviews everywhere, so an empty result here means the endpoint, not
    // the show.
    const reviews = await clients.reviews.forShow({ showId: "1200361736", storefront: config.storefront, limit: 3 });
    return reviews.length
      ? { name, ok: true, detail: `reachable; pulled ${reviews.length} review(s) from the test show` }
      : warning(name, "the reviews endpoint answered but returned nothing for a show that should have reviews in every storefront");
  } catch (error) {
    return warning(name, `${(error as Error).message} The reviews feed is an older Apple endpoint and is flakier than the rest; everything else still works.`);
  }
}

async function checkLibrary(config: Config): Promise<DoctorCheck[]> {
  if (!config.libraryEnabled) return [{ name: "Local library", ok: true, detail: "switched off with APPLE_PODCASTS_LIBRARY=0" }];
  if (process.platform !== "darwin") {
    return [{ name: "Local library", ok: true, detail: `exists only on macOS, and this is ${process.platform}; everything else works here` }];
  }
  if (!existsSync(config.libraryPath)) {
    return [
      warning(
        "Local library",
        `no database at ${config.libraryPath}; it is created the first time the Podcasts app runs and follows a show`,
        "Set APPLE_PODCASTS_LIBRARY_PATH if yours is elsewhere, or APPLE_PODCASTS_LIBRARY=0 to hide these tools.",
      ),
    ];
  }

  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  const builtIn = major > 22 || (major === 22 && minor >= 5);
  const checks: DoctorCheck[] = [
    { name: "SQLite", ok: true, detail: builtIn ? "built into Node" : "the sqlite3 command, since Node is below 22.5" },
  ];

  try {
    const db = await openDatabase(config.libraryPath);
    try {
      const shows = db.query("select count(*) as n from ZMTPODCAST")[0]?.n ?? 0;
      const episodes = db.query("select count(*) as n from ZMTEPISODE")[0]?.n ?? 0;
      checks.push({ name: "Local library", ok: true, detail: `${shows} show(s), ${episodes} episode(s) at ${config.libraryPath}` });

      // The schema is Apple's private store and changes between app releases.
      // A library that opens but has lost this column would silently return no
      // transcript matches, which is the worst kind of failure.
      try {
        const withSnippet = db.query("select count(*) as n from ZMTEPISODE where ZFREETRANSCRIPTSNIPPET is not null")[0]?.n ?? 0;
        checks.push(
          Number(withSnippet) > 0
            ? { name: "Cached transcript excerpts", ok: true, detail: `${withSnippet} episode(s) carry one, which is what search_library searches` }
            : warning("Cached transcript excerpts", "the column exists but nothing is in it; Apple fills it as the app syncs, so a new library may not have them yet"),
        );
      } catch {
        checks.push(
          warning(
            "Cached transcript excerpts",
            "this Podcasts app version does not have the transcript column this server expects; the library tools still work, but search_library will not match on transcripts",
          ),
        );
      }

      // Reported rather than judged. An empty play table is normal on a Mac and
      // saying so here stops it being read as a bug later.
      try {
        const played = db.query("select count(*) as n from ZMTEPISODE where ZPLAYHEAD > 0")[0]?.n ?? 0;
        checks.push(
          Number(played) > 0
            ? { name: "Play data", ok: true, detail: `${played} episode(s) have a play position` }
            : warning(
                "Play data",
                "no episode in this library has a play position, which is normal: progress is tracked on the device you listen on and does not sync to the Mac, so the tools say so rather than reporting zeros",
              ),
        );
      } catch {
        // Not worth a line of its own if the column is gone.
      }
    } finally {
      db.close();
    }
  } catch (error) {
    checks.push({ name: "Local library", ok: false, detail: (error as Error).message });
  }
  return checks;
}

async function checkAnalytics({ clients, config }: ToolContext, network: boolean): Promise<DoctorCheck[]> {
  const name = "Apple Podcasts Connect";
  if (!hasReporterCredentials(config)) {
    return [
      warning(
        name,
        `not configured, which is expected unless you own a show (vendor number ${config.vendorNumber ? "set" : "not set"}, token ${config.reporterToken ? "set" : "not set"})`,
        "Set APPLE_PODCASTS_VENDOR_NUMBER and APPLE_PODCASTS_REPORTER_TOKEN, both from Apple Podcasts Connect; the token is generated under the account's Reporter settings and expires after 180 days.",
      ),
    ];
  }
  if (!network) return [{ name, ok: true, detail: "credentials set; --network checks the token" }];
  try {
    const vendors = await clients.reporter.vendors();
    const matches = vendors.length === 0 || vendors.includes(config.vendorNumber!);
    return [
      matches
        ? { name, ok: true, detail: `token accepted${vendors.length ? `; readable vendor number(s): ${vendors.join(", ")}` : ""}. Reporting lags one to two days.` }
        : { name, ok: false, detail: `the token cannot read vendor number ${config.vendorNumber}; it can read ${vendors.join(", ")}` },
    ];
  } catch (error) {
    return [{ name, ok: false, detail: (error as Error).message }];
  }
}
