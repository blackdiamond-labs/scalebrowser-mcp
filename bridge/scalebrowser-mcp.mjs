#!/usr/bin/env node
// A stdio MCP server for the Scalebrowser desktop app. With the app running it
// relays every message to the app's own MCP endpoint and adds nothing; without
// it, it answers with the tool list and a note on how to install the app.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const SETUP_HINT = [
  'Scalebrowser is not running on this machine, so this server has no browser to drive.',
  'Scalebrowser runs on Windows 10 or 11, 64-bit, and needs an account with an active plan or trial.',
  'Install the desktop app (https://scalebrowser.net/docs/install), sign in, start it,',
  'then restart this MCP server. It finds the app through %LOCALAPPDATA%\\Scalebrowser,',
  'or through the directory passed with --data-dir.',
].join(' ');

// The desktop app writes the address it listens on into runtime.json and its API
// token into a file next to it. /health answers without a token, so a running app
// is recognised before any credential is sent.
async function findApp({ dataDir, env }) {
  if (!dataDir) return null;
  let runtime;
  try {
    runtime = JSON.parse(await readFile(join(dataDir, 'runtime.json'), 'utf8'));
  } catch {
    return null;
  }
  // The app binds to loopback only. Any other address in runtime.json did not come
  // from the app, and the token must not travel there.
  let hostname;
  try {
    ({ hostname } = new URL(`http://${runtime.native_addr}`));
  } catch {
    return null;
  }
  if (!(hostname === 'localhost' || hostname === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(hostname))) return null;
  const token = env.SCALEBROWSER_TOKEN ?? (await readFile(join(dataDir, 'token'), 'utf8').catch(() => '')).trim();
  const base = `http://${runtime.native_addr}`;
  try {
    const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1500) });
    if (!health.ok) return null;
  } catch {
    return null;
  }
  return { url: `${base}/v1/mcp`, token };
}

export async function createBridge({ dataDir, env = {}, send, tools = [] }) {
  const app = await findApp({ dataDir, env });
  const reply = (message, result) => send({ jsonrpc: '2.0', id: message.id, result });

  const session = { id: null, protocolVersion: null, initializeId: undefined, handshake: Promise.resolve() };

  // A notification has no id and therefore nobody to tell; a request gets its
  // failure as a JSON-RPC error so the client can reason about it.
  function fail(message, text) {
    if (message.id !== undefined) send({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: text } });
  }

  function relay(message) {
    if (message.id !== undefined && message.id === session.initializeId && message.result?.protocolVersion) {
      session.protocolVersion = message.result.protocolVersion;
    }
    send(message);
  }

  // One SSE event carries one JSON-RPC message in its data lines. An event with
  // empty data (the daemon opens every stream with one) carries nothing.
  function emitEvent(block) {
    const data = block
      .split('\n')
      .filter((field) => field.startsWith('data:'))
      .map((field) => field.slice(5).replace(/^ /, ''))
      .join('\n');
    if (data.trim() !== '') relay(JSON.parse(data));
  }

  // Everything but initialize waits until the initialize answer has been relayed:
  // the app refuses a request that arrives without the session id it hands out.
  async function forward(message, line) {
    if (message.method !== 'initialize') {
      await session.handshake;
      await post(message, line);
      return;
    }
    session.initializeId = message.id;
    let finish;
    session.handshake = new Promise((resolve) => { finish = resolve; });
    try {
      await post(message, line);
    } finally {
      finish();
    }
  }

  async function post(message, line) {
    const headers = {
      authorization: `Bearer ${app.token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    if (session.id) headers['mcp-session-id'] = session.id;
    if (session.protocolVersion) headers['mcp-protocol-version'] = session.protocolVersion;
    let response;
    try {
      response = await fetch(app.url, { method: 'POST', headers, body: line });
    } catch (error) {
      fail(message, `Scalebrowser is not reachable at ${app.url}: ${error.cause?.code ?? error.message}. Is the app still running?`);
      return;
    }
    session.id = response.headers.get('mcp-session-id') ?? session.id;
    if (response.status === 401) {
      fail(message, 'Scalebrowser refused the API token. Set SCALEBROWSER_TOKEN, or check the token file in the data directory.');
      return;
    }
    if (response.status === 404) {
      fail(message, 'The Scalebrowser app no longer knows this session, for example because it restarted. Restart this MCP server.');
      return;
    }
    if (!response.ok) {
      fail(message, `Scalebrowser answered HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
      return;
    }
    const type = response.headers.get('content-type') ?? '';
    if (type.startsWith('application/json')) {
      relay(await response.json());
      return;
    }
    if (!type.startsWith('text/event-stream')) return;
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true }).replaceAll('\r\n', '\n');
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          emitEvent(buffer.slice(0, end));
          buffer = buffer.slice(end + 2);
        }
      }
    } catch (error) {
      fail(message, `Scalebrowser stopped answering in the middle of a reply: ${error.cause?.message ?? error.message}. Is the app still running?`);
      return;
    }
    emitEvent(buffer);
  }

  return {
    mode: app ? 'forward' : 'offline',

    // The app keeps a session until told otherwise, so a client that goes away
    // says so. A failure here changes nothing for anyone: the client is gone.
    async close() {
      if (!app || !session.id) return;
      await fetch(app.url, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${app.token}`, 'mcp-session-id': session.id },
        signal: AbortSignal.timeout(2000),
      }).catch(() => {});
    },

    async handleLine(line) {
      if (line.trim() === '') return;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
        return;
      }
      if (app) {
        await forward(message, line);
        return;
      }
      if (message.id === undefined) return;
      if (message.method === 'initialize') {
        reply(message, {
          protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'scalebrowser', version: '0.1.0' },
          instructions: SETUP_HINT,
        });
      } else if (message.method === 'tools/list') {
        reply(message, {
          tools: tools.map(({ name, description }) => ({ name, description, inputSchema: { type: 'object' } })),
        });
      } else if (message.method === 'tools/call') {
        reply(message, { isError: true, content: [{ type: 'text', text: SETUP_HINT }] });
      } else if (message.method === 'ping') {
        reply(message, {});
      } else {
        send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } });
      }
    },
  };
}

function dataDirFrom(argv, env) {
  const flag = argv.indexOf('--data-dir');
  if (flag !== -1) return argv[flag + 1];
  return env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Scalebrowser') : undefined;
}

async function main() {
  const dataDir = dataDirFrom(process.argv.slice(2), process.env);
  const tools = JSON.parse(await readFile(new URL('./tools.json', import.meta.url), 'utf8'));
  // Standard output belongs to the protocol; everything for a person goes to stderr.
  const log = (text) => process.stderr.write(`scalebrowser-mcp: ${text}\n`);
  const bridge = await createBridge({
    dataDir,
    env: process.env,
    tools,
    send: (message) => process.stdout.write(`${JSON.stringify(message)}\n`),
  });
  log(bridge.mode === 'forward'
    ? `relaying to the Scalebrowser app (data directory ${dataDir})`
    : 'Scalebrowser app not found, serving the tool list and install instructions only');

  process.stdout.on('error', () => process.exit(0));
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const inFlight = new Set();
  lines.on('line', (line) => {
    const work = bridge.handleLine(line)
      .catch((error) => log(`dropped a message: ${error.message}`))
      .finally(() => inFlight.delete(work));
    inFlight.add(work);
  });
  // A client that closes stdin still gets the answers already on their way, for
  // at most ten seconds, then the session ends at the app.
  lines.on('close', async () => {
    await Promise.race([Promise.allSettled(inFlight), new Promise((resolve) => setTimeout(resolve, 10000))]);
    await bridge.close();
    process.stdout.write('', () => process.exit(0));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
