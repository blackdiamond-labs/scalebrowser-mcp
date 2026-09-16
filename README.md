# Scalebrowser MCP

**Your agent got blocked, stopped at a login, or gave up on a captcha?** Scalebrowser gives each AI agent its own isolated browser with a persistent identity, running on your own machine instead of a vendor's cloud. It stays signed in, handles the captcha, types like a human, and you can take over whenever you want.

This repository connects that browser to your agent over MCP: copy-paste configurations for every client the documentation covers, a small stdio bridge, and runnable SDK examples.

**Before you start**

- **Windows 10 or 11, 64-bit, with a real GPU.** Scalebrowser is a desktop app that runs on your machine. There is no hosted mode.
- **A Scalebrowser account with an active plan.** The way in is a 7-day trial with one browser. A payment method is required up front. [Plans and prices](https://scalebrowser.net/pricing)

**Free, no account needed:** [scalebrowser.net/check](https://scalebrowser.net/check) measures how your current browser looks from the outside, and [scalebrowser.net/ai-agent-check](https://scalebrowser.net/ai-agent-check) measures what your automation tool does with it. Point your agent at the second one and see what a website can tell.

## Try it in five minutes

1. Sign in at [scalebrowser.net](https://scalebrowser.net/login), open **Download**, and run the installer. It installs for the current user and asks for no administrator rights. SmartScreen warns on first run: choose **More info**, then **Run anyway**.
2. Start the app and press **Sign in**. The app then downloads and verifies the browser engine, which has to finish before any profile can start.
3. Copy your API token from **Settings, General, Connect an agent**.
4. Connect your agent. For Claude Code it is one command:

   ```bash
   claude mcp add --transport http scalebrowser http://127.0.0.1:8787/v1/mcp \
     --header "Authorization: Bearer $SCALEBROWSER_TOKEN"
   ```

5. Ask it something:

   > Open news.ycombinator.com in a Scalebrowser profile, read the front page, and tell me the three stories with the most comments.

The agent takes a lease, which reserves a profile and starts its browser, opens the page, reads a text map of it and answers. Then ask it to release the profile.

## Connect your client

Each file below is the configuration from the [official documentation](https://scalebrowser.net/docs/agents/mcp-clients), ready to copy. Replace `<token>` with your API token and `<you>` with your Windows user name. Where each file goes, and the two spellings that fail without an error, is in [clients/README.md](clients/README.md).

| Client | Configuration |
| --- | --- |
| Claude Code | [claude-code.mcp.json](clients/claude-code.mcp.json) or the command above |
| Claude desktop app | [claude-desktop.json](clients/claude-desktop.json) |
| Cursor | [cursor.mcp.json](clients/cursor.mcp.json) |
| Codex | [codex.config.toml](clients/codex.config.toml) |
| GitHub Copilot in VS Code | [github-copilot.mcp.json](clients/github-copilot.mcp.json) |
| Antigravity | [antigravity.mcp_config.json](clients/antigravity.mcp_config.json) |
| Claude Code inside WSL | [wsl-claude-code.json](clients/wsl-claude-code.json) |
| Claude on the web, Grok, ChatGPT and other cloud chat services | No file: they reach your machine through [remote access](https://scalebrowser.net/docs/agents/remote) |

## What your agent gets

The agent works from a text map of the page and addresses elements by reference. It looks at the page once, then only at what moved: 13,507 tokens where Playwright MCP needs 2.1 million.

- **Signing in:** `credential_fill` signs in with a login stored in the profile, and `credential_new` signs up with a password Scalebrowser draws and stores. The agent never sees the value.
- **Confirmation codes:** `read_inbox` reads the codes sent to the address bound to the profile, and `inbox_open_link` opens a link from a message.
- **Challenges:** `press_and_hold`, `click` and four measuring tools work through verification challenges with the same human input. The [measured status per challenge type](https://scalebrowser.net/docs/agents/verification) says what passes and what does not.
- **Proof of the work:** `record` and `video` turn a run into a film, and every tool call becomes a step in the run's trail.

The full list is in the [tool reference](https://scalebrowser.net/docs/agents/tools). What an agent may do is decided by the app, not by the client.

## The bridge

[bridge/scalebrowser-mcp.mjs](bridge/scalebrowser-mcp.mjs) is a stdio MCP server with no dependencies. With the Scalebrowser app running on the same Windows machine, it relays every message to the app's own MCP endpoint, using the address and token the app keeps in `%LOCALAPPDATA%\Scalebrowser`. Without the app, it answers with the tool list and install instructions. That second mode is what MCP directories see when they build this repository.

Clients that speak HTTP do not need it: use the configurations above. For a client that only starts servers over stdio:

```bash
node bridge/scalebrowser-mcp.mjs
```

It needs Node 22 or newer. `--data-dir` points it at another data directory, and `SCALEBROWSER_TOKEN` overrides the token file.

## SDK examples

The same small task in both SDKs: open Hacker News in a profile and print the three top stories. Run them on the Windows machine the app runs on, with your token in `SCALEBROWSER_TOKEN`.

```bash
cd examples/node
npm ci
node top-stories.mjs
```

```bash
cd examples/python
pip install --require-hashes -r requirements.txt
python top_stories.py
```

Both use the published SDKs, [@scalebrowser/sdk](https://www.npmjs.com/package/@scalebrowser/sdk) on npm and [scalebrowser](https://pypi.org/project/scalebrowser/) on PyPI. The [SDK documentation](https://scalebrowser.net/docs/sdks) covers the full surface.

## Links

- [Website](https://scalebrowser.net)
- [Documentation](https://scalebrowser.net/docs) and [Quickstart](https://scalebrowser.net/docs/quickstart)
- [Pricing](https://scalebrowser.net/pricing)
- Questions: support@scalebrowser.net

## License

Everything in this repository is MIT-licensed. The Scalebrowser app and its browser engine are a separate, licensed product.
