// Every browser script must at least parse — a typo here breaks the whole page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

for (const f of fs.readdirSync('public/js').filter((f) => f.endsWith('.js'))) {
  test(`public/js/${f} parses`, () => {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', `public/js/${f}`], { stdio: 'pipe' }));
  });
}
