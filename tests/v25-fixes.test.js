import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import * as W from '../dist/world.js';
import * as O from '../dist/offseason.js';
import {makeSeason, nextDay, resolveEvent, advanceSeason, START_YEAR} from '../dist/engine.js';

const raw = id => JSON.parse(fs.readFileSync(new URL(`../dist/data/roster_${id.toLowerCase()}.json`, import.meta.url), 'utf8'));
const bases = Object.fromEntries(W.LEAGUE_ORDER.map(id => [id, W.toWorldScale(id, raw(id))]));

test('all five starters take turns in the rotation', () => {
  const data = bases.KBO, s = makeSeason(data, 'kbo:HH', 7);
  // 40 days: a 5-man turn gives each starter about 8 starts; an injury can cost one a few.
  for (let i = 0; i < 40; i++) { if (s.event) resolveEvent(s, data, 0); nextDay(s, data); }
  for (const t of data.teams) {
    const starts = s.teams[t.id].rotation.map(id => s.pitching[id]?.gs || 0);
    assert.ok(Math.min(...starts) >= 3 && starts.filter(n => n >= 6).length >= 4, `${t.zh} rotation starts ${starts}`);
  }
});

test('generated rookies get league-appropriate names that are not real players', () => {
  const data = bases.KBO, s = makeSeason(data, data.teams[0].id, 3);
  while (s.phase !== 'finished') { if (s.event) resolveEvent(s, data, 0); nextDay(s, data); }
  const next = advanceSeason(s, data), real = new Set(data.players.map(p => p.name));
  const rookies = next.playerPool.filter(p => p.id.startsWith('sim:'));
  assert.ok(rookies.length > 0);
  const korean = '金李朴崔鄭姜趙尹張林韓吳申徐權黃';
  for (const p of rookies) {
    const name = p.name.replace('（虛構新人）', '');
    assert.ok(p.name.endsWith('（虛構新人）'));
    assert.ok(korean.includes(name[0]) && name.length === 3, name);
    assert.ok(!real.has(name), name);
  }
});

test('packed world saves are smaller and restore to the same world', () => {
  const w = W.makeWorld(bases, 'KBO', 'kbo:HH', 9);
  for (const id of W.LEAGUE_ORDER) w.leagues[id].phase = 'finished';
  for (const id of W.LEAGUE_ORDER) w.leagues[id].champion = bases[id].teams[0].id;
  const next = O.advanceWorld(w, bases);
  assert.equal(next.year, START_YEAR + 1);
  for (const id of W.LEAGUE_ORDER) if (id !== 'KBO') assert.equal(next.leagues[id].offseason, null);
  const packed = W.packWorld(next, bases), plain = JSON.stringify(next);
  assert.ok(packed.length < plain.length * 0.8, `${packed.length} vs ${plain.length}`);
  const a = W.restoreWorld(JSON.parse(packed), bases), b = W.restoreWorld(JSON.parse(plain), bases);
  assert.ok(isDeepStrictEqual(a, b));
  assert.ok(packed.length < 2_000_000, 'second-year save must stay well inside Safari storage');
});
