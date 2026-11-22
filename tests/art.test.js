import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defenseDiagram, shortName} from '../dist/art.js';

test('defense diagram labels all nine positions and escapes names', () => {
  const pos = ['C', 'P', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
  const svg = defenseDiagram([...pos.map((p, i) => ({pos: p, name: `Player ${i}`})), {pos: 'DH', name: '<b>x</b>'}]);
  for (const p of pos) assert.ok(svg.includes(`>${p}</tspan>`), p);
  assert.ok(!svg.includes('<b>'));
  assert.equal(shortName('Corey Seager'), 'Seager');
  assert.equal(shortName('王彥程'), '王彥程');
});

test('realistic photos exist, stay small, and are labelled as AI-generated wherever they appear', () => {
  const app = fs.readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8'), css = fs.readFileSync(new URL('../dist/styles.css', import.meta.url), 'utf8');
  for (const name of ['stadium-night', 'dugout', 'champion', 'offseason', 'office']) {
    const file = new URL(`../dist/img/${name}.webp`, import.meta.url);
    assert.ok(fs.statSync(file).size < 200_000, name);
    assert.ok(app.includes(`'${name}'`) || css.includes(`img/${name}.webp`), `${name} is used`);
  }
  // Every photo background carries the on-screen note; banners carry it in their caption.
  assert.equal((app.match(/photo-bg /g) || []).length, (app.match(/<span class="photo-note">AI 生成示意圖<\/span>/g) || []).length);
  assert.match(app, /<figcaption>AI 生成示意圖<\/figcaption>/);
  // Events no longer carry illustrations.
  assert.ok(!app.includes('eventArt'));
});
