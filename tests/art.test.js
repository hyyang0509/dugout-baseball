import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneFor, eventArt, SCENE_NAMES, defenseDiagram, shortName} from '../dist/art.js';
import {STORIES} from '../dist/stories.js';

test('every story and event type gets a real scene illustration', () => {
  for (const t of STORIES) assert.ok(SCENE_NAMES.includes(sceneFor({type: 'clubhouse', story: t.id})), t.id);
  for (const type of ['injury', 'training', 'offfield', 'clubhouse', 'trade_offer', 'league_trade', 'team', 'unknown'])
    assert.ok(SCENE_NAMES.includes(sceneFor({type})), type);
  // Every scene is reachable and renders as a banner.
  const used = new Set([...STORIES.map(t => sceneFor({type: 'clubhouse', story: t.id})), 'trade', 'office']);
  assert.deepEqual([...used].sort(), [...SCENE_NAMES].sort());
  for (const t of STORIES) assert.match(eventArt({type: 'clubhouse', story: t.id}), /^<svg[^>]*viewBox="0 0 560 150"/);
  // No photos or external images: everything is inline vector art.
  for (const t of STORIES) assert.ok(!/<image|href=/.test(eventArt({type: 'clubhouse', story: t.id})));
});

test('defense diagram labels all nine positions and escapes names', () => {
  const pos = ['C', 'P', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
  const svg = defenseDiagram([...pos.map((p, i) => ({pos: p, name: `Player ${i}`})), {pos: 'DH', name: '<b>x</b>'}]);
  for (const p of pos) assert.ok(svg.includes(`>${p}</tspan>`), p);
  assert.ok(!svg.includes('<b>'));
  assert.equal(shortName('Corey Seager'), 'Seager');
  assert.equal(shortName('王彥程'), '王彥程');
});
