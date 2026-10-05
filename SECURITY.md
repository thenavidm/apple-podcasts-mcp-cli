# Security

## Reporting a vulnerability

[Report it privately](https://github.com/thenavidm/apple-podcasts-mcp-cli/security/advisories/new).
Please do not open a public issue for a security problem: an issue is visible to
everyone the moment you file it, including whoever would use the bug.

Include what you did, what happened, and what you expected. A proof of concept
helps.

## What this server holds

Almost nothing, which is the point. The catalog, charts, reviews and RSS feeds
are all public and need no credential at all.

The exception is **Apple Podcasts Connect credentials**, used only by the owner
analytics tools and only if you supply them. They stay in your client's config
and are sent to Apple and nowhere else.

The local library tools read the Apple Podcasts database on your own Mac. That
is why macOS asks for Full Disk Access: the database sits in a protected
location. Nothing from it leaves your machine.

There is no backend and no telemetry.

## Untrusted content

Show notes, episode descriptions, reviews and transcripts are written by other
people. Treat anything returned from a feed or a review as data to report on,
never as instructions.

Reviews are the sharpest case, because a review is public text a stranger chose
and "summarize my reviews" is one of the first things anyone asks.

## Write safety

Apple publishes no write API for podcasts, so this server cannot post,
subscribe, rate or delete. The one thing it writes is the OPML export, a file at
a path you name, which overwrites whatever is there, so it waits for your
approval.

Over MCP a person approves the export where the client can ask: Claude Code
shows its own prompt, and a client that can show forms asks with one. Each
approval is signed, bound to that exact call and works once. Where a client can
do neither, the model must pass `confirm: true`, and
`APPLE_PODCASTS_CONFIRM=model` allows that everywhere, for an agent with no
person to ask. `APPLE_PODCASTS_READ_ONLY=1` removes the export entirely, and
`APPLE_PODCASTS_AUDIT_LOG` records every attempt, with who approved it.

## Running it over HTTP

`--http` binds `127.0.0.1` and will not start on any other address without
`APPLE_PODCASTS_HTTP_TOKEN`, which it then requires as a bearer token. It refuses
a request from a page on another site unless `APPLE_PODCASTS_HTTP_ALLOWED_ORIGINS`
lists it. That is a lock on one door, not an authentication system: it belongs
behind TLS and an authenticating proxy. Set `APPLE_PODCASTS_LIBRARY=0` when
hosting, or one machine's subscriptions are served to every caller.

## Good-faith research

Read, run and pull apart anything here. Nobody but the maintainer can change
this repository, so nothing you do while investigating puts it at risk.

The care is owed to the service the tool talks to, not to the code. When
testing, use your own account and your own data. Do not point it at somebody
else's, and do not hammer a shared API to the point where other people notice.
If a test could affect anyone but you, stop and send a private report first.

Research done in that spirit is welcome, and nothing here is a trap.

## Supported versions

The latest published version gets fixes.
