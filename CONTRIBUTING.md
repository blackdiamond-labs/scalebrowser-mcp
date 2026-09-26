# Contributing

This repository holds the MCP client configurations, the stdio bridge, the Claude Code plugin and the SDK examples for [Scalebrowser](https://scalebrowser.net). The configurations mirror the official documentation, so a change to them starts there.

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

One version goes out four ways: the MCP Bundle on the GitHub release, the npm package `@scalebrowser/mcp`, the MCP Registry entry `net.scalebrowser/mcp` that points at both, and the Claude Code plugin, which is this repository itself. `npm test` fails when `package.json`, `manifest.json`, `server.json` and `.claude-plugin/plugin.json` disagree on the version, the tool list or the bundle address.

1. Raise `version` in `package.json`, `manifest.json`, `server.json` and `.claude-plugin/plugin.json` together. Claude Code offers an installed plugin an update only when that last one moves.
2. Build the bundle: `npx @anthropic-ai/mcpb@2.1.2 pack . scalebrowser-<version>.mcpb`. `.mcpbignore` keeps it to the bridge, its tool list, the manifest, the icon, the README and the license.
3. Put `sha256sum scalebrowser-<version>.mcpb` into `server.json`, commit, and attach exactly that file to the release `v<version>`. A bundle packed a second time has a different hash.
4. Publish the npm package, then the registry entry (`mcp-publisher login dns --domain scalebrowser.net`, `mcp-publisher publish`). The registry checks `mcpName` in the published npm version, so npm goes first.

## The plugin

`.claude-plugin/` makes this repository a plugin marketplace with one plugin, whose root is the repository root. Its server lives in the root `.mcp.json`, and `skills/scalebrowser/SKILL.md` is the skill it adds. Claude Code opened inside this repository reads that same `.mcp.json` as a project server, where `${CLAUDE_PLUGIN_ROOT}` means nothing: decline it there. `claude plugin validate .` checks the manifests.
