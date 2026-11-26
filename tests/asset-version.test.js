import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Browsers cache dist/ files, so every reference carries the same asset version (?v=N).
// One forgotten number mixes old and new modules on players' devices; in Node a test that
// imports engine.js with an older number than dist does even loads two copies of the engine.
const read = (dir, f) => fs.readFileSync(new URL(`../${dir}/${f}`, import.meta.url), 'utf8');
const list = (dir, ext) => fs.readdirSync(new URL(`../${dir}/`, import.meta.url)).filter(f => f.endsWith(ext));
const files = [
  ...list('dist', '.js').map(f => ['dist', f]),
  ['dist', 'index.html'],
  ...list('tests', '.test.js').map(f => ['tests', f]),
];

function versions() {
  const found = [];
  for (const [dir, f] of files) {
    for (const m of read(dir, f).matchAll(/\?v=(\d+)/g)) found.push({file: `${dir}/${f}`, v: m[1]});
  }
  return found;
}

test('every asset reference uses one version number', () => {
  const found = versions();
  assert.ok(found.length > 20, 'asset references found');
  const counts = {};
  for (const x of found) counts[x.v] = (counts[x.v] || 0) + 1;
  const main = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const odd = found.filter(x => x.v !== main).map(x => `${x.file} ?v=${x.v}`);
  assert.deepEqual(odd, [], `expected every reference to use ?v=${main}`);
});

test('every module import, data fetch and stylesheet in dist carries the version', () => {
  const missing = [];
  for (const [dir, f] of files.filter(([d]) => d === 'dist')) {
    const text = read(dir, f);
    const refs = [
      ...text.matchAll(/(?:from|import\()\s*['"`](\.\/[^'"`]+\.js[^'"`]*)['"`]/g),
      ...text.matchAll(/fetch\(\s*[`'"](\.\/[^`'"]+)[`'"]/g),
      ...text.matchAll(/(?:src|href)="(\.\/[^"]+\.(?:js|css))"/g),
    ].map(m => m[1]);
    for (const r of refs) if (!/\?v=\d+/.test(r)) missing.push(`${dir}/${f}: ${r}`);
  }
  assert.deepEqual(missing, []);
});

test('the footer version and the asset version match the newest changelog entry', () => {
  const log = read('docs', 'CHANGELOG.md');
  const top = log.split(/\n(?=# v)/)[0];
  const release = top.match(/^# (v[\d.]+)/)?.[1];
  assert.ok(release, 'CHANGELOG starts with "# vX.Y"');
  const footer = read('dist', 'app.js').match(/<span>(v[\d.]+) · \$\{esc\(activeLeague\)\}/)?.[1];
  // A patch release (v3.8.1) may keep the minor version (v3.8) in the footer.
  assert.ok(footer && (release === footer || release.startsWith(footer + '.')), `footer ${footer} vs changelog ${release}`);
  const asset = top.match(/資產版本號 v=(\d+)/)?.[1];
  assert.equal(asset, versions()[0].v, 'newest changelog entry names the current asset version');
});
