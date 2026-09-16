# Client configurations

Every file in this folder is a configuration block from the [Scalebrowser documentation](https://scalebrowser.net/docs/agents/mcp-clients), copied unchanged. They all reach the same MCP server: the one inside the Scalebrowser desktop app.

## Your address and token

The app starts its daemon for you. The token is the contents of `%LOCALAPPDATA%\Scalebrowser\token`, and the address it is listening on is the `native_addr` field of `%LOCALAPPDATA%\Scalebrowser\runtime.json`. That is usually `127.0.0.1:8787`, but the app moves up a port when something else already holds it. The app also shows both under **Settings, General, Connect an agent**, ready to copy.

**The token is a full-power credential.** It reaches every profile, every stored session and the whole management API. Keep it out of a repository, and prefer your client's environment-variable syntax over a literal in a file that gets committed.

## Where each file goes

| File | Client | Copy it to |
| --- | --- | --- |
| [claude-code.mcp.json](claude-code.mcp.json) | Claude Code | `.mcp.json` in a project, or `~/.claude.json` |
| [claude-desktop.json](claude-desktop.json) | Claude desktop app | `claude_desktop_config.json` |
| [cursor.mcp.json](cursor.mcp.json) | Cursor | `.cursor/mcp.json` in a project, or `~/.cursor/mcp.json` |
| [codex.config.toml](codex.config.toml) | Codex | `~/.codex/config.toml`, or `.codex/config.toml` in a project |
| [github-copilot.mcp.json](github-copilot.mcp.json) | GitHub Copilot in VS Code | `.vscode/mcp.json` in a workspace |
| [antigravity.mcp_config.json](antigravity.mcp_config.json) | Antigravity | `~/.gemini/config/mcp_config.json`, or `.agents/mcp_config.json` in a workspace |
| [wsl-claude-code.json](wsl-claude-code.json) | Claude Code inside WSL | `~/.claude.json` |

## What fails without an error

- **Claude Code needs `"type": "http"`.** It reads an entry that has a `url` but no `type` as a stdio server and skips it.
- **The stdio entries need `--data-dir`.** Without it the process looks in `%ProgramData%\Scalebrowser`, which is not where the desktop app keeps anything. Since 0.9 it stops and names the directory it expected; older builds attach to the wrong daemon silently.
- **GitHub Copilot's top-level key is `servers`**, not the `mcpServers` most other clients use.
- **Antigravity wants `serverUrl`**, not `url`. An entry that says `url` never loads.
- **Codex needs room for slow tools.** `wait_for` waits for a page to settle and `press_and_hold` holds for about ten seconds, so keep `tool_timeout_sec` at 120 or more.
- **Inside WSL, `127.0.0.1` is the Linux side.** That is why the WSL file starts the daemon over stdio instead: the program is named with a Linux path, the data directory with a Windows one.

## Chat services in someone else's cloud

A client running in a browser tab cannot reach your loopback address. Those services connect through remote access: create a connection in the portal, switch remote access on in the app under **Settings, General, Remote access**, and paste the connection's address into the service. The browser stays on your machine. [Remote access](https://scalebrowser.net/docs/agents/remote) has the steps.

| Service | Works |
| --- | --- |
| Claude on the web, desktop, mobile | yes |
| Grok | yes |
| ChatGPT | Business, Enterprise and Edu only |
| Gemini Enterprise, Gemini CLI | yes |
| Gemini consumer app | no |
| Mistral, now "Vibe" | no |

## Any other client

The server speaks the standard Streamable HTTP transport at `/v1/mcp` and negotiates the protocol revision. A client that speaks MCP needs the address and the token in an `Authorization` header. For a client that only starts servers over stdio, the [bridge](../README.md#the-bridge) in this repository does that.
