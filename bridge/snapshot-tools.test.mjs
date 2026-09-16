import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toolsFromReference } from './snapshot-tools.mjs';

// An excerpt of https://scalebrowser.net/docs/agents/tools.md, kept verbatim.
const REFERENCE = `
## \`core\`
The default set, on its own.

| Tool                   | What it does                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------ |
| \`lease_profile\`        | Reserve a free profile, start its browser, bind a tab, and return the handle.        |
| \`open_page\`            | Navigate to a public http or https address, and get the full page map back.          |

## \`workflows\`
| Tool               | What it does                                                    |
| ------------------ | --------------------------------------------------------------- |
| \`record_workflow\`  | Bracket a stretch of ordinary work so it can be replayed later. |

## \`credentials\`
| Tool               | What it does                                                             |
| ------------------ | ------------------------------------------------------------------------ |
| \`read_inbox\`       | The profile's confirmation codes, by mail or by text.                    |

## The destructive ones
| Tool               | Profile       |
| ------------------ | ------------- |
| \`click\`            | \`core\`        |
`;

test('the snapshot takes the tools of the named profiles, in document order', () => {
  assert.deepEqual(toolsFromReference(REFERENCE, ['core', 'credentials']), [
    { name: 'lease_profile', description: 'Reserve a free profile, start its browser, bind a tab, and return the handle.' },
    { name: 'open_page', description: 'Navigate to a public http or https address, and get the full page map back.' },
    { name: 'read_inbox', description: "The profile's confirmation codes, by mail or by text." },
  ]);
});
