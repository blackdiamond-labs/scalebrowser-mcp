// Opens Hacker News in a Scalebrowser profile and prints the three top stories.
//
// Needs the Scalebrowser app running on this Windows machine and its API token:
//   set SCALEBROWSER_TOKEN=<token>        (cmd)   or   $env:SCALEBROWSER_TOKEN="<token>"   (PowerShell)
//   node top-stories.mjs
// Run it on the machine the app runs on: the browser's DevTools socket is only
// reachable from there.
import { ScalebrowserClient } from '@scalebrowser/sdk';

const sb = new ScalebrowserClient({
  baseUrl: process.env.SCALEBROWSER_BASE_URL ?? 'http://127.0.0.1:8787',
  token: process.env.SCALEBROWSER_TOKEN,
});

// The same profile every run, so it keeps its identity and its cookies.
const name = 'sdk-example';
const profile = (await sb.listProfiles({ q: name })).find((p) => p.name === name)
  ?? (await sb.createProfile({ name }));

const session = await sb.launch(profile.id, { headless: true });
try {
  await session.cdp.navigate('https://news.ycombinator.com');
  const titles = await session.cdp.evaluate(
    "[...document.querySelectorAll('.titleline > a')].slice(0, 3).map((a) => a.textContent)",
  );
  for (const title of titles) console.log(title);
} finally {
  await session.stop();
}
