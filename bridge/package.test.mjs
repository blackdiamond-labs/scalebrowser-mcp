import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The same server goes out three ways: the npm package, the MCPB bundle and the
// MCP Registry entry that points at both. Each carries its own copy of the
// version, and the registry refuses a name that does not match the package.
const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const pkg = read('package.json');
const manifest = read('manifest.json');

test('the bundle manifest carries the package version', () => {
  assert.equal(manifest.version, pkg.version);
});

test('the bundle manifest lists exactly the tools the bridge serves without the app', () => {
  assert.deepEqual(manifest.tools, read('bridge/tools.json'));
});

test('the bundle starts the same file the npm bin names', () => {
  assert.equal(manifest.server.entry_point, pkg.bin['scalebrowser-mcp']);
  assert.deepEqual(manifest.server.mcp_config.args, [`\${__dirname}/${pkg.bin['scalebrowser-mcp']}`]);
});

test('the registry entry carries the package name and version in every place', { skip: !existsSync(new URL('../server.json', import.meta.url)) }, () => {
  const server = read('server.json');
  assert.equal(server.name, pkg.mcpName);
  assert.equal(server.version, pkg.version);
  for (const entry of server.packages) {
    assert.equal(entry.version, pkg.version, entry.registryType);
    if (entry.registryType === 'npm') assert.equal(entry.identifier, pkg.name);
    if (entry.registryType === 'mcpb') {
      assert.equal(
        entry.identifier,
        `https://github.com/blackdiamond-labs/scalebrowser-mcp/releases/download/v${pkg.version}/scalebrowser-${pkg.version}.mcpb`,
      );
      assert.match(entry.fileSha256, /^[0-9a-f]{64}$/);
    }
  }
});

test('cli: initialize names the package version', async () => {
  const script = fileURLToPath(new URL('./scalebrowser-mcp.mjs', import.meta.url));
  const child = spawn(process.execPath, [script], { env: {} });
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stdin.end(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
  await new Promise((resolve) => child.on('close', resolve));
  assert.equal(JSON.parse(stdout.trim().split('\n')[0]).result.serverInfo.version, pkg.version);
});
