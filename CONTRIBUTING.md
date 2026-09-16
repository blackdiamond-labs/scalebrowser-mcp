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
