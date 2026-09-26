# Contributing

This repository holds the MCP client configurations, the stdio bridge and the SDK examples for [Scalebrowser](https://scalebrowser.net). The configurations mirror the official documentation, so a change to them starts there.

## Pull requests

We accept pull requests that fix a typo or a dead link. For anything else, write to support@scalebrowser.net instead of opening a pull request; other pull requests are closed with a pointer to this file.

## Questions and problems

Issues are switched off. Write to support@scalebrowser.net, including security reports.

## Working on the bridge

```bash
npm test                              # the bridge and the tool snapshot, no dependencies
node bridge/snapshot-tools.mjs        # refresh bridge/tools.json from the public tool reference
node bridge/snapshot-tools.mjs --check
```

## Releasing

One version goes out three ways: the MCP Bundle on the GitHub release, the npm package `@scalebrowser/mcp`, and the MCP Registry entry `net.scalebrowser/mcp` that points at both. `npm test` fails when `package.json`, `manifest.json` and `server.json` disagree on the version, the tool list or the bundle address.

1. Raise `version` in `package.json`, `manifest.json` and `server.json` together.
2. Build the bundle: `npx @anthropic-ai/mcpb@2.1.2 pack . scalebrowser-<version>.mcpb`. `.mcpbignore` keeps it to the bridge, its tool list, the manifest, the icon, the README and the license.
3. Put `sha256sum scalebrowser-<version>.mcpb` into `server.json`, commit, and attach exactly that file to the release `v<version>`. A bundle packed a second time has a different hash.
4. Publish the npm package, then the registry entry (`mcp-publisher login dns --domain scalebrowser.net`, `mcp-publisher publish`). The registry checks `mcpName` in the published npm version, so npm goes first.
