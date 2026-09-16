#!/usr/bin/env node
// Refreshes bridge/tools.json, the tool list the bridge serves while the app is
// not running, from the public tool reference. The desktop app serves these four
// profiles, so the snapshot shows what a customer's agent gets.
//
//   node bridge/snapshot-tools.mjs          rewrite bridge/tools.json
//   node bridge/snapshot-tools.mjs --check  exit 1 when the file is out of date
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const REFERENCE_URL = 'https://scalebrowser.net/docs/agents/tools.md';
const PROFILES = ['core', 'extended', 'management', 'credentials'];
const TARGET = new URL('./tools.json', import.meta.url);

export function toolsFromReference(markdown, profiles) {
  const tools = [];
  let current = null;
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^## `([a-z]+)`\s*$/);
    if (heading) {
      current = heading[1];
      continue;
    }
    if (line.startsWith('## ')) {
      current = null;
      continue;
    }
    const row = line.match(/^\|\s*`([a-z_.]+)`\s*\|\s*(.+?)\s*\|\s*$/);
    if (row && profiles.includes(current)) tools.push({ name: row[1], description: row[2] });
  }
  return tools;
}

async function main() {
  const response = await fetch(REFERENCE_URL, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${REFERENCE_URL} answered HTTP ${response.status}`);
  const snapshot = `${JSON.stringify(toolsFromReference(await response.text(), PROFILES), null, 2)}\n`;
  if (process.argv.includes('--check')) {
    const current = await readFile(TARGET, 'utf8').catch(() => '');
    if (current !== snapshot) {
      console.error('bridge/tools.json differs from the public tool reference. Run: node bridge/snapshot-tools.mjs');
      process.exit(1);
    }
    console.error('bridge/tools.json matches the public tool reference.');
    return;
  }
  await writeFile(TARGET, snapshot);
  console.error(`bridge/tools.json: ${JSON.parse(snapshot).length} tools`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
