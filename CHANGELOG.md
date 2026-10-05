# Apple Podcasts MCP Server & CLI changelog

| Component | Version | Last Updated |
|-----------|---------|--------------|
| apple-podcasts-mcp-cli | 2.0.0 | 2026-10-05 |

---

## 2.0.0, 2026-10-05

Built on [Slipway](https://github.com/thenavidm/slipway) 0.1.9. The 32 tools keep their names and arguments, and every difference below was measured against 1.1.2 before release.

- **A person approves the OPML export over MCP.** It is the one tool that writes, and it overwrites whatever is at the path. Claude Code (2.1.246 and later) shows its own prompt, and a client that can show forms asks with an approval form whose one box starts unticked. Approvals are signed, bound to the exact call and work once. Where a client can do neither, the model's `confirm: true` still counts, and `APPLE_PODCASTS_CONFIRM=model` makes it enough everywhere. The refusal still says the export overwrites the file, and the audit log records who approved it.
- **A smaller tool list.** 12,701 tokens in Claude Code with every tool loaded, down from 13,764: the per-tool `$schema` line, an `execution` field and `additionalProperties: false` are gone. The last one advertised strict input while unknown keys were dropped anyway; the schema now says what happens. The library tools still tell clients they never leave this Mac.
- **`APPLE_PODCASTS_LIBRARY=0` works as before**, through the `library` toolset it now turns off, and `APPLE_PODCASTS_TOOLSETS` can name toolsets directly.
- **Exit codes follow the house contract everywhere.** An unknown command, the export in read-only mode and a library tool with the library off exit 2 instead of 1, and an argument Apple rejects exits 2 instead of 5. 1 now means an unexpected error; Apple's rate limit, which it sends as a 403, still exits 7, and a library macOS will not open still exits 5. Errors keep the endpoint, the source and Apple's own words in `details`.
- **`which <words>` finds a command in the words people use**: "where does a show rank" finds `find-chart-position` and "how is this show rated" finds `get-reviews`. `agent-context` describes every command, flag and setting as JSON. In Codex, finding the command that shows where a podcast ranks across countries took 84,197 input tokens instead of 84,531 (median of five). Over MCP the same task read one more out of about 48,260, all of it in the part of the tool list Codex keeps when it cuts a long printout.
- **`install <client>`** adds the server to Claude Code, Codex, Claude Desktop, Cursor, VS Code or Gemini CLI in each one's own format.
- **Less work to start.** The entry turns on Node's compile cache, and the server spends 164 ms of CPU before its first answer where 1.1.2 spent 199 (median of 21 runs, taking turns on one busy Mac). npx installs 4 dependencies instead of 94.
- **Docs fixes.** SECURITY.md said the server has no write path and that HTTP has no authentication; it now describes the export and `--http`'s token and Origin checks. The README has a Features table and a Which one table, the release workflow attaches the desktop extension, the icon and terminal recording load from cdn.navid.me, and THIRD_PARTY_NOTICES.md lists the production dependencies' licenses.

### Upgrading

Node 22 or newer; 1.1 ran on 20, and the library's built-in SQLite needs 22.5. Scripts keep working for success, usage errors, a refused export and missing analytics setup; one that read exit 1 as an unknown command, read-only mode or the library being off, or 5 as a bad argument, should read 2. Over MCP, expect an approval prompt or form for the export; a headless agent that should export with `confirm: true` alone needs `APPLE_PODCASTS_CONFIRM=model`. A script that pipes JSON-RPC into the server must keep stdin open until it reads the answer: the server now stops when its input ends, as the MCP stdio binding asks. `--http` will not start on an address other than localhost without `APPLE_PODCASTS_HTTP_TOKEN`, and refuses a page from another site unless `APPLE_PODCASTS_HTTP_ALLOWED_ORIGINS` lists it. Some terminal screens grew: the general help by 132 tokens, for `which`, `install`, the flags, the exit codes and the safety settings it now lists; the command list by 37, for the library toolset's heading and the lines that point to `which` and `--help`; and a missing argument's error by 17, for its code and the help to read.

## 1.1.2, 2026-10-04

- **`npx -y @thenavidm/apple-podcasts-mcp-cli` always starts the MCP server.** npx starts whichever binary the npm registry lists first when they share one file, and the registry does not keep the published order, so an MCP client set up with this README's install line could get `apple-podcasts-cli` and its command list instead of a server. A third binary named after the package now always starts the server, and npx picks it by name.

## 1.1.1

SKILL.md's exit-code table now matches the code: a refused write exits 2, not 5, and 10 says what is missing.

## 1.1.0

### Renamed to apple-podcasts-mcp-cli

The package and the repo are now `@thenavidm/apple-podcasts-mcp-cli`, the name
every server with a CLI carries. The binaries keep their names,
`apple-podcasts-mcp` and `apple-podcasts-cli`. The old package is deprecated
with a pointer here, and GitHub redirects the old repo address.

### A Claude Desktop extension

`desktop-extension/build.sh` produces a `.mcpb` that vendors its own
dependencies, so it installs on a double click with nothing present first. It
asks for the country, whether to read the local library, and, only for a show
owner, the Apple Podcasts Connect vendor number and Reporter token. Each
release carries the file.

### Exit codes follow the contract

Nothing configured exits 10, not 4: "Apple Podcasts Connect is not configured"
names the Reporter token, and matching auth first sent people looking for an
expired credential they never had. A refused write exits 2, not 5, because it
is the caller's to fix. A show Apple does not have exits 3, not 5: Apple answers
it with 200 and an empty result, so the error class decides, not the status.

### The README shows both surfaces

The CLI was built in 1.0 and the README never said so. It now opens with both
surfaces and real commands, and the FAQ covers what the CLI is and when to use
it instead of the MCP server. Releases are made by `publish.yml` on a tag.


## 1.0.0

First release. TypeScript, 32 tools, 77 tests.

### Apple Podcasts is four sources, not one API

The thing worth building around. The catalog, the charts and reviews, a show's
RSS feed, and Apple Podcasts Connect share a brand and nothing else. They differ
in who can reach them, what they are good for, and whether they need a
credential at all. Three of the four need nothing, which is why most of this
works the moment it is installed.

Covering all of them in one server is the point. "How is this show doing" is not
a catalog question or a chart question, it is both plus reviews plus publishing
cadence, and the answer only means something when they sit next to each other.
That is what `get_show_profile` and `compare_shows` do in one call, and doing it
by hand is a dozen requests and a lot of clerical joining.

### The local library holds a transcript corpus nothing reads

The Podcasts app keeps a Core Data store with every episode of every followed
show, whether or not anything was downloaded. On a normally-used library that is
tens of thousands of episodes with full descriptions, dates, durations and guids.

Nearly every one of them also carries `ZFREETRANSCRIPTSNIPPET`: a JSON array of
speaker-tagged lines Apple caches from its own transcription. A few hundred
characters each, present for around 99% of episodes. `search_library` searches
it, which makes "which episode was that in" answerable for the first time.

Two limits are load-bearing and are surfaced rather than smoothed over, because
a tool that implies otherwise produces confident wrong answers:

**Apple's full transcripts are not readable.** The database holds CDN paths to
TTML files and that CDN refuses unauthenticated requests. The excerpt is what
there is, and the tools never claim more.

**Play data does not reach the Mac.** On a library synced from a phone, the
playhead and play-count columns are zero on every row. Listening progress is
tracked on the device that played the episode. So nothing here reports listening
history, and `library_stats` says whether a given library is an exception rather
than presenting a zero as a finding. A handful of stray played rows in a library
of tens of thousands is noise, and the check is a share of the library rather
than a bare count for exactly that reason.

Its dates are Core Data timestamps, seconds since 2001. Read as Unix time,
every date in the library lands in 1970.

### Charts and reviews, which the ecosystem ignores

Apple publishes live ranking per storefront and it is free. Top Shows is
follower-weighted and slow; Trending Episodes moves fast and is the better read
on a topic. Both cap at 100, and a genre-scoped chart returns 404, so a genre
ranking can only ever be the overall chart filtered. Both facts are stated in
the output rather than left for a caller to infer from a thin result.

Apple has no endpoint for "where does this show rank", so `find_chart_position`
fetches each chart and looks the show up by id. Matching is by id rather than
name: titles collide and pick up suffixes between the catalog and the chart, and
a name match reports the wrong show as ranked.

The reviews feed is an old iTunes RSS endpoint wearing a JSON coat. It caps at
50 per page and 10 pages, and page 11 returns something that is not JSON at all,
so paging stops on a short page rather than trusting a count. Apple also
prepends a feed-description object to page 1 with the show's own blurb where a
review's title goes; it is dropped by shape rather than by index, because it is
absent on later pages. Left in, every summary opens with a fake five-star review.

### Apple's API answers 200 for failures

A malformed Search API query returns HTTP 200 with an `errorMessage` field and
zero results. Handled by status alone that is indistinguishable from a search
that matched nothing, and a model told a search found nothing concludes the show
does not exist. Every response body is inspected on success, not only on failure.

Rate limiting is the other silent one: roughly 20 requests a minute per IP,
answered with 403 and an HTML body, with no `Retry-After` and no quota endpoint.
Requests are queued behind a minimum interval rather than fired in parallel, and
responses are cached briefly, so comparing six shows fetches the chart once.

### Two dependencies

The MCP SDK and zod. RSS parsing and SQLite reading are both built in.

A general XML library is a large answer to a narrow question, and every
transitive package is paid for on every `npx` cold start, so the reader here
handles the parts podcast RSS actually uses: CDATA, entities, namespace
prefixes, self-closing tags, and a `>` inside a quoted attribute. It never throws
on malformed input, because half a parsed feed beats an exception.

SQLite is read through Node's built-in `node:sqlite` where available, with the
`sqlite3` command that ships with macOS as the fallback for Node 20 and 21. That
avoids a native module, which would turn a download into a build. Both open the
database read-only through an immutable URI, which is also what makes reads work
while the Podcasts app holds the file open.

### Almost nothing writes

There is no Apple Podcasts write API and this server does not invent one. 31 of
32 tools only read, so the confirmation machinery that earns its place on a
publishing server would be theatre here. `export_subscriptions` is guarded
because it writes a file and would overwrite one.

The control that matters is privacy instead: `APPLE_PODCASTS_LIBRARY=0` removes
the seven library tools from the list entirely. The HTTP transport refuses to
start bound to anything but loopback while the library is enabled, because a
hosted instance would otherwise serve one person's subscriptions and cached
transcripts to every caller.
