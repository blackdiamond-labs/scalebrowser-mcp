---
name: scalebrowser
description: Work in a real browser profile through Scalebrowser, which stays signed in between runs, types and moves like a person, and runs on the user's own Windows machine. Use it when a task needs a website that blocks ordinary automation, an account that must stay logged in, a confirmation code from the profile's inbox, or a browser the user can watch and take over.
---

# Working in a Scalebrowser profile

Scalebrowser gives each agent its own browser profile with a persistent identity. You never drive the browser directly: you read a text map of the page and address elements by reference, and every click and keystroke goes through a layer that makes it look like a person's.

## Before you start

The Scalebrowser app has to be running and signed in on the same Windows machine as this agent. If a tool answers that Scalebrowser is not running on this machine, stop and tell the user: install the app from https://scalebrowser.net/docs/install, sign in, start it, then restart the MCP server. Retrying the call will not help.

## The loop

1. `lease_profile` reserves a free profile, starts its browser and returns a **handle**. Every other page tool takes that handle. The window stays hidden unless you pass `headless: false`, so pass it when the user wants to watch or take over.
2. `start_run` says in one sentence what this stretch of work is for, so the user can follow it.
3. `open_page` goes to a public http or https address and returns the full page map.
4. Act: `click`, `type_text`, `fill_form`, `press_key`, `scroll`, `wait_for`.
5. `release_profile` gives the profile back when you are done. Always release, also after a failure.

A lease expires on its own after 15 minutes by default. For longer work, call `lease_renew` before it runs out.

## Reading the page

The map is flat lines. `[e_418] button "Post" (disabled)` means you address that button as `e_418`. A line like `|scroll down: 1.8 screens|` tells you how much page is left below.

After the first map, each action answers with only what changed: `+` for new lines, `~` for changed ones, `-` for removed ones. What the page says back ("Incorrect password", "3 results") arrives in that diff, the way a screen reader would announce it. A full map comes back after a navigation, after a large reflow, every few steps, and whenever you call `snapshot` with `mode: "full"`.

References belong to one page. After a navigation, an old reference is refused as `stale_ref`, and the refusal carries a fresh map, so read it and carry on.

For longer text, `read_text` returns the page's prose verbatim and `read_value` reads one value, a count or a table. Take a `screenshot` only when the map cannot describe what you need, for example a picture.

## Acting safely

**There is no confirmation step and no undo.** The server does not know that "Delete account" or "Buy now" cannot be taken back. Read the map before any action that changes something for real, and when in doubt, ask the user first.

Every failed call says whether it happened: `phase`, `effect` and `retryable`. When `retryable` is false, and above all after `effect_unknown` or `partial_effect`, take a `snapshot` and look before you act again. The action may already have landed, and repeating it can post twice.

## The profile's own rules

A profile can carry a `PROFILE.md` written by its owner: what the account is for, its tone, what to avoid. It arrives with the lease reply. Follow it for everything you do in that profile. A direct instruction from the user comes first.

## Logins, secrets and codes

Never ask the user to paste a password into the chat, and never invent one and type it in the clear. The desktop app serves these tools:

- `credential_fill` signs in with the login stored in the profile. You never see the value.
- `credential_new` signs up with a password the app draws, stores and types for you.
- `read_inbox` reads confirmation codes sent to the profile's address, and `inbox_open_link` opens a link from a message.
- `secret_list` shows which stored values you may use without reading them.

If they are missing, whoever runs the server has left them out on purpose. Tell the user, and do not work around it.

## Verification challenges

`press_and_hold` and `click` work through verification challenges with the same human input. Which challenge types pass and which do not is measured and listed at https://scalebrowser.net/docs/agents/verification. When one does not pass, say so and hand over to the user, who can finish it in the profile's window.

## More

- Every tool: https://scalebrowser.net/docs/agents/tools
- How the server works: https://scalebrowser.net/docs/agents/mcp-server
- Questions: support@scalebrowser.net
