import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The repository is also a Claude Code plugin marketplace with one plugin in it.
// The plugin starts the bridge that ships with it, so it needs neither npm nor a
// token in any file: the bridge finds the app and its token by itself.
const text = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const read = (path) => JSON.parse(text(path));
const pkg = read('package.json');
const plugin = read('.claude-plugin/plugin.json');
const marketplace = read('.claude-plugin/marketplace.json');
// The server sits in `.mcp.json` at the plugin root rather than inline in
// plugin.json: `claude plugin details` counts only that file, and a reviewer who
// reads "MCP servers (0)" there is looking at a plugin that seems to do nothing.
const { mcpServers } = read('.mcp.json');

test('the marketplace lists the plugin from this repository root', () => {
  assert.deepEqual(marketplace.plugins.map((entry) => [entry.name, entry.source]), [[plugin.name, './']]);
});

test('the plugin carries the package version', () => {
  assert.equal(plugin.version, pkg.version);
});

test('the plugin starts the same bridge file the npm bin names, from its own copy', () => {
  assert.equal(plugin.mcpServers, undefined, 'one place for the server, .mcp.json');
  const servers = Object.values(mcpServers);
  assert.equal(servers.length, 1);
  assert.equal(servers[0].command, 'node');
  assert.deepEqual(servers[0].args, [`\${CLAUDE_PLUGIN_ROOT}/${pkg.bin['scalebrowser-mcp']}`]);
});

test('no token or address is written into the plugin', () => {
  const [server] = Object.values(mcpServers);
  assert.equal(server.env, undefined);
  assert.equal(server.url, undefined);
  assert.equal(server.headers, undefined);
});

test('the skill names itself and says when it applies', () => {
  const skill = text('skills/scalebrowser/SKILL.md');
  const front = skill.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(front, 'SKILL.md starts with a frontmatter block');
  assert.match(front[1], /^name: scalebrowser$/m);
  assert.match(front[1], /^description: .{40,}$/m);
});

// Error codes from the public tool reference share the spelling of a tool name.
const ERROR_CODES = new Set(['stale_ref', 'effect_unknown', 'partial_effect']);

test('every tool the skill names is one the server serves', () => {
  const served = new Set(read('bridge/tools.json').map((tool) => tool.name));
  const named = [...text('skills/scalebrowser/SKILL.md').matchAll(/`([a-z]+(?:[._][a-z]+)+)`/g)]
    .map((m) => m[1])
    .filter((name) => !ERROR_CODES.has(name));
  assert.ok(named.length > 5, 'the skill names the tools it relies on');
  for (const name of named) assert.ok(served.has(name), `${name} is not in bridge/tools.json`);
});

test('no dash that reads as machine-written in text a customer sees', () => {
  for (const path of ['skills/scalebrowser/SKILL.md', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'README.md']) {
    assert.doesNotMatch(text(path), /[—–]/, path);
  }
});
