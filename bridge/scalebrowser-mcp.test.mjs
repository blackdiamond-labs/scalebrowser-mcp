import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';

import { createBridge } from './scalebrowser-mcp.mjs';

function emptyDataDir() {
  return mkdtempSync(join(tmpdir(), 'sb-bridge-test-'));
}

async function offlineBridge(options = {}) {
  const sent = [];
  const bridge = await createBridge({
    dataDir: emptyDataDir(),
    env: {},
    send: (message) => sent.push(message),
    log: () => {},
    ...options,
  });
  return { bridge, sent };
}

test('offline: initialize answers with the protocol version the client asked for', async () => {
  const { bridge, sent } = await offlineBridge();
  await bridge.handleLine(JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } },
  }));
  assert.equal(sent[0].result.protocolVersion, '2025-06-18');
});

test('offline: initialize tells the client where to get the app', async () => {
  const { bridge, sent } = await offlineBridge();
  await bridge.handleLine(JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } },
  }));
  assert.match(sent[0].result.instructions, /https:\/\/scalebrowser\.net\/docs\/install/);
});

test('offline: initialize declares the tools capability so clients ask for the list', async () => {
  const { bridge, sent } = await offlineBridge();
  await bridge.handleLine(JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } },
  }));
  assert.deepEqual(sent[0].result.capabilities, { tools: {} });
});

test('offline: tools/list serves the snapshot, each tool with an object schema', async () => {
  const tools = [{ name: 'lease_profile', description: 'Reserve a free profile.' }];
  const { bridge, sent } = await offlineBridge({ tools });
  await bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
  assert.deepEqual(sent[0].result.tools, [
    { name: 'lease_profile', description: 'Reserve a free profile.', inputSchema: { type: 'object' } },
  ]);
});

test('offline: tools/call answers with an error result that carries the setup hint', async () => {
  const { bridge, sent } = await offlineBridge();
  await bridge.handleLine(JSON.stringify({
    jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'lease_profile', arguments: {} },
  }));
  assert.equal(sent[0].result.isError, true);
  assert.match(sent[0].result.content[0].text, /not running/);
});

test('offline: ping answers with an empty result', async () => {
  const { bridge, sent } = await offlineBridge();
  await bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'ping' }));
  assert.deepEqual(sent, [{ jsonrpc: '2.0', id: 4, result: {} }]);
});

test('offline: an unknown request method answers with method-not-found', async () => {
  const { bridge, sent } = await offlineBridge();
  await bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'resources/list' }));
  assert.equal(sent[0].error.code, -32601);
});

test('offline: a notification gets no answer', async () => {
  const { bridge, sent } = await offlineBridge();
  await bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
  assert.deepEqual(sent, []);
});

test('a line that is not JSON answers with a parse error and a null id', async () => {
  const { bridge, sent } = await offlineBridge();
  await bridge.handleLine('{"jsonrpc": "2.0", "id": ');
  assert.deepEqual(sent.map((m) => [m.id, m.error.code]), [[null, -32700]]);
});

test('a blank line gets no answer', async () => {
  const { bridge, sent } = await offlineBridge();
  await bridge.handleLine('   ');
  assert.deepEqual(sent, []);
});

// A stand-in for the daemon: a real HTTP server on loopback that records every
// request and answers /v1/mcp with whatever the test hands it.
async function fakeDaemon(answer) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');
        return;
      }
      answer(req, res, body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { requests, port, close: () => new Promise((resolve) => server.close(resolve)) };
}

function dataDirFor(port, token = 'file-token') {
  const dir = emptyDataDir();
  writeFileSync(join(dir, 'runtime.json'), JSON.stringify({ native_addr: `127.0.0.1:${port}` }));
  writeFileSync(join(dir, 'token'), `${token}\n`);
  return dir;
}

const INITIALIZE = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } },
};

test('forward: with the app running, initialize reaches the daemon', async (t) => {
  const daemon = await fakeDaemon((req, res) => res.writeHead(202).end());
  t.after(daemon.close);
  const bridge = await createBridge({ dataDir: dataDirFor(daemon.port), env: {}, send: () => {}, log: () => {} });
  await bridge.handleLine(JSON.stringify(INITIALIZE));
  const mcp = daemon.requests.filter((r) => r.url === '/v1/mcp');
  assert.deepEqual(mcp.map((r) => [r.method, JSON.parse(r.body).method]), [['POST', 'initialize']]);
});

test('a runtime.json left behind by an app that no longer answers means offline', async () => {
  const daemon = await fakeDaemon(() => {});
  await daemon.close();
  const sent = [];
  const bridge = await createBridge({
    dataDir: dataDirFor(daemon.port), env: {}, send: (m) => sent.push(m), log: () => {},
  });
  await bridge.handleLine(JSON.stringify(INITIALIZE));
  assert.match(sent[0].result.instructions, /not running/);
});

test('forward: SCALEBROWSER_TOKEN wins over the token file', async (t) => {
  const daemon = await fakeDaemon((req, res) => res.writeHead(202).end());
  t.after(daemon.close);
  const bridge = await createBridge({
    dataDir: dataDirFor(daemon.port, 'file-token'), env: { SCALEBROWSER_TOKEN: 'env-token' }, send: () => {}, log: () => {},
  });
  await bridge.handleLine(JSON.stringify(INITIALIZE));
  const mcp = daemon.requests.find((r) => r.url === '/v1/mcp');
  assert.equal(mcp.headers.authorization, 'Bearer env-token');
});

// The shape the real daemon answers a request with: an empty priming event first,
// then one event per JSON-RPC message.
function sse(res, messages, headers = {}) {
  res.writeHead(200, { 'content-type': 'text/event-stream', ...headers });
  res.write('data: \nid: 0\nretry: 3000\n\n');
  for (const message of messages) res.write(`data: ${JSON.stringify(message)}\n\n`);
  res.end();
}

async function forwardingBridge(t, answer, env = {}) {
  const daemon = await fakeDaemon(answer);
  t.after(daemon.close);
  const sent = [];
  const bridge = await createBridge({
    dataDir: dataDirFor(daemon.port), env, send: (m) => sent.push(m), log: () => {},
  });
  return { daemon, bridge, sent };
}

const INIT_RESULT = { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } };

test('forward: an SSE answer reaches the client as exactly its JSON-RPC message', async (t) => {
  const { bridge, sent } = await forwardingBridge(t, (req, res) => sse(res, [INIT_RESULT]));
  await bridge.handleLine(JSON.stringify(INITIALIZE));
  assert.deepEqual(sent, [INIT_RESULT]);
});

test('forward: the session id and negotiated protocol version ride on every later request', async (t) => {
  const { daemon, bridge } = await forwardingBridge(t, (req, res, body) => {
    const { id, method } = JSON.parse(body);
    if (method === 'initialize') sse(res, [INIT_RESULT], { 'mcp-session-id': 'session-7' });
    else sse(res, [{ jsonrpc: '2.0', id, result: { tools: [] } }]);
  });
  await bridge.handleLine(JSON.stringify(INITIALIZE));
  await bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
  const later = daemon.requests.filter((r) => r.url === '/v1/mcp')[1];
  assert.deepEqual(
    [later.headers['mcp-session-id'], later.headers['mcp-protocol-version']],
    ['session-7', '2025-06-18'],
  );
});

test('forward: a plain JSON answer reaches the client unchanged', async (t) => {
  const { bridge, sent } = await forwardingBridge(t, (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(INIT_RESULT));
  });
  await bridge.handleLine(JSON.stringify(INITIALIZE));
  assert.deepEqual(sent, [INIT_RESULT]);
});

test('forward: a refused token answers the request with an error that names the token', async (t) => {
  const { bridge, sent } = await forwardingBridge(t, (req, res) => {
    res.writeHead(401, { 'content-type': 'application/json' }).end('{"code":4010,"message":"unauthorized"}');
  });
  await bridge.handleLine(JSON.stringify(INITIALIZE));
  assert.equal(sent[0].id, 1);
  assert.match(sent[0].error.message, /token/);
});

test('forward: a session the app no longer knows asks the client to restart this server', async (t) => {
  const { bridge, sent } = await forwardingBridge(t, (req, res) => res.writeHead(404).end('Not Found: Session not found'));
  await bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' }));
  assert.match(sent[0].error.message, /restart this MCP server/i);
});

test('forward: any other refusal reaches the client with the status and what the app said', async (t) => {
  const { bridge, sent } = await forwardingBridge(t, (req, res) => res.writeHead(422).end('Unexpected message, expect initialize request'));
  await bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }));
  assert.equal(sent[0].error.message, 'Scalebrowser answered HTTP 422: Unexpected message, expect initialize request');
});

test('forward: an app that stops answering mid-session turns the request into an error, not a crash', async (t) => {
  const { daemon, bridge, sent } = await forwardingBridge(t, (req, res) => sse(res, [INIT_RESULT]));
  await daemon.close();
  await bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'ping' }));
  assert.match(sent[0].error.message, /not reachable/);
});

test('forward: a line that is not JSON is answered locally with a parse error', async (t) => {
  const { daemon, bridge, sent } = await forwardingBridge(t, (req, res) => res.writeHead(202).end());
  await bridge.handleLine('{"jsonrpc": "2.0", "id": ');
  assert.deepEqual(
    [sent.map((m) => m.error.code), daemon.requests.filter((r) => r.url === '/v1/mcp').length],
    [[-32700], 0],
  );
});

test('forward: a stream that breaks mid-answer turns the request into an error, not a crash', async (t) => {
  const { bridge, sent } = await forwardingBridge(t, (req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: \n\n');
    setTimeout(() => res.socket.destroy(), 20);
  });
  await bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'snapshot' } }));
  assert.match(sent[0].error.message, /not reachable|stopped answering/);
});

test('forward: close ends the session at the app', async (t) => {
  const { daemon, bridge } = await forwardingBridge(t, (req, res) => {
    if (req.method === 'DELETE') res.writeHead(202).end();
    else sse(res, [INIT_RESULT], { 'mcp-session-id': 'session-9' });
  });
  await bridge.handleLine(JSON.stringify(INITIALIZE));
  await bridge.close();
  const last = daemon.requests.at(-1);
  assert.deepEqual([last.method, last.headers['mcp-session-id']], ['DELETE', 'session-9']);
});

test('forward: a notification the app accepts with 202 produces no output', async (t) => {
  const { daemon, bridge, sent } = await forwardingBridge(t, (req, res) => res.writeHead(202).end());
  await bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
  assert.deepEqual([sent, daemon.requests.filter((r) => r.url === '/v1/mcp').length], [[], 1]);
});

test('forward: several messages in one stream reach the client in order', async (t) => {
  const progress = { jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: 1, progress: 1 } };
  const result = { jsonrpc: '2.0', id: 7, result: { content: [] } };
  const { bridge, sent } = await forwardingBridge(t, (req, res) => sse(res, [progress, result]));
  await bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'snapshot' } }));
  assert.deepEqual(sent, [progress, result]);
});

test('offline: initialize without params still answers with a protocol version', async () => {
  const { bridge, sent } = await offlineBridge();
  await bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }));
  assert.equal(sent[0].result.protocolVersion, '2025-06-18');
});

test('cli: over real stdin and stdout, an offline bridge serves the bundled tool list and exits when stdin ends', async () => {
  const script = fileURLToPath(new URL('./scalebrowser-mcp.mjs', import.meta.url));
  const child = spawn(process.execPath, [script, '--data-dir', emptyDataDir()], { env: {} });
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stdin.write(`${JSON.stringify(INITIALIZE)}\n`);
  child.stdin.end(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  const code = await new Promise((resolve) => child.on('close', resolve));
  const lines = stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual([code, lines.map((m) => m.id), lines[1].result.tools.length], [0, [1, 2], 65]);
});

test('cli: a client that closes stdin right after its last request still gets the answers', async (t) => {
  const daemon = await fakeDaemon((req, res, body) => {
    if (req.method === 'DELETE') return res.writeHead(202).end();
    const { id, method } = JSON.parse(body);
    const answer = method === 'initialize' ? INIT_RESULT : { jsonrpc: '2.0', id, result: { tools: [] } };
    setTimeout(() => sse(res, [answer], { 'mcp-session-id': 'session-cli' }), 50);
  });
  t.after(daemon.close);
  const script = fileURLToPath(new URL('./scalebrowser-mcp.mjs', import.meta.url));
  const child = spawn(process.execPath, [script, '--data-dir', dataDirFor(daemon.port)], { env: {} });
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stdin.end(`${JSON.stringify(INITIALIZE)}\n`);
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.deepEqual([code, stdout.trim().split('\n').map((line) => JSON.parse(line).id)], [0, [1]]);
});

test('forward: a request sent before the initialize answer arrives waits for the session id', async (t) => {
  const { daemon, bridge } = await forwardingBridge(t, (req, res, body) => {
    if (req.method === 'DELETE') return res.writeHead(202).end();
    const { id, method } = JSON.parse(body);
    if (method === 'initialize') setTimeout(() => sse(res, [INIT_RESULT], { 'mcp-session-id': 'session-slow' }), 80);
    else sse(res, [{ jsonrpc: '2.0', id, result: { tools: [] } }]);
  });
  await Promise.all([
    bridge.handleLine(JSON.stringify(INITIALIZE)),
    bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })),
  ]);
  const list = daemon.requests.find((r) => r.body.includes('tools/list'));
  assert.equal(list.headers['mcp-session-id'], 'session-slow');
});

test('a runtime.json that names an address off this machine is not trusted with the token', async (t) => {
  const outward = Object.values(networkInterfaces()).flat().find((a) => a.family === 'IPv4' && !a.internal);
  if (!outward) return t.skip('no non-loopback IPv4 address to test with');
  const requests = [];
  const server = createServer((req, res) => { requests.push(req.headers); res.writeHead(200).end('{}'); });
  await new Promise((resolve) => server.listen(0, outward.address, resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const dir = emptyDataDir();
  writeFileSync(join(dir, 'runtime.json'), JSON.stringify({ native_addr: `${outward.address}:${server.address().port}` }));
  writeFileSync(join(dir, 'token'), 'secret-token');
  const bridge = await createBridge({ dataDir: dir, env: {}, send: () => {}, log: () => {} });
  assert.deepEqual([bridge.mode, requests.length], ['offline', 0]);
});
