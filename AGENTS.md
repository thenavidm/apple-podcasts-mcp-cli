# Working on apple-podcasts-mcp-cli

For agents editing this repository. Users read the README. Driving the server is
`SKILL.md`.

## What this is

A read-only server over Apple's public podcast surfaces: the iTunes Search
catalog, chart rankings per storefront, listener reviews, and RSS feeds. Owner
analytics need Apple Podcasts Connect credentials; nothing else needs an account
of any kind.

## Non-negotiables

**Commit as `n@navid.me`.** Never pass `-c user.email=`. The global config is
correct and the override is the bug.

**Everything here reads, except the OPML export, which writes a file.** Apple
publishes no write API for podcasts. Do not add a tool that implies one exists.

**Slipway serves both surfaces.** `src/app.ts` describes the app: tools,
settings, resources, prompts and doctor. Slipway owns MCP, the CLI, `--http`,
the write guard, approvals, annotations and the audit log. `src/tools/kit.ts`
adapts the tool modules, tags the library tools so `APPLE_PODCASTS_LIBRARY=0`
turns them off, marks them closed-world, and turns Apple's errors into exit
codes. `src/guide.ts` holds the server instructions, resources and prompts, and
`src/format/fence.ts` the marker that wraps text strangers wrote.

**An empty result is an answer, not a failure.** A show absent from one
storefront is present in another, and a feed without transcripts simply does not
publish them. Return the empty result with the reason rather than retrying or
reporting an error, or the model invents workarounds for something working
correctly.

**A malformed query returns HTTP 200 with an `errorMessage` field**, not a 4xx.
Check the body, not the status, or a broken search looks like an empty catalog.

**Storefronts change the answer.** Charts, availability and reviews are all per
country. A result without its storefront is meaningless, so carry it through.

**The library tools read the Apple Podcasts app's local database** and only
exist on macOS. They are filtered out of any hosted deployment, because serving
one machine's subscriptions to every caller is not something to leave to chance.

## Before claiming it works

```bash
npm run build && npm test && npm run typecheck
npx @modelcontextprotocol/inspector node dist/index.js
```
