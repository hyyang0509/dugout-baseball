import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

// app.js runs only in the browser, so no other test imports it; at least make sure every
// shipped module parses.
test('every dist module parses', () => {
  const dir = new URL('../dist/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', new URL(f, dir).pathname.replace(/^\/([A-Za-z]:)/, '$1')], {stdio: 'pipe'}), f);
  }
});
