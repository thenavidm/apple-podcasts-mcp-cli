# Third party notices

The source in this repository is MIT licensed. These production dependencies keep their own licenses, and the desktop bundle ships each one's license file with it:

| Dependency | License |
|---|---|
| [@thenavidm/slipway](https://github.com/thenavidm/slipway) | Apache-2.0 |
| [@modelcontextprotocol/server](https://github.com/modelcontextprotocol/typescript-sdk) and its `core` package | Apache-2.0 |
| [zod](https://github.com/colinhacks/zod) | MIT |

RSS parsing is done here, and the library is read through Node's own `node:sqlite`, or the `sqlite3` command that ships with macOS below Node 22.5, so neither brings a package of its own.
