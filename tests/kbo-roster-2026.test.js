import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as W from '../dist/world.js';
import {autoLineup, missingSavePlayers, seasonData, teamOf} from '../dist/engine.js';
import {LEGACY_ROSTERS} from '../dist/leagues.js';

const read = name => JSON.parse(fs.readFileSync(new URL(`../dist/data/${name}`, import.meta.url), 'utf8'));
const kbo = read('roster_kbo.json');
const legacy = read('roster_kbo_20251031.json');

test('2026 KBO roster: post-season snapshot, Wang Yen-Cheng on Hanwha, labelled estimates', () => {
  assert.equal(kbo.snapshot_date, '2026-11-20');
  assert.match(kbo.source_note, /維基百科/);
  assert.match(kbo.source_note, /禁止未經核准的自動收集/);
  const wang = kbo.players.find(p => p.source_name === '왕옌청');
  assert.ok(wang, 'Wang Yen-Cheng is listed');
  assert.equal(wang.name, '王彥程');
  assert.equal(wang.team_id, 'kbo:HH');
  assert.equal(wang.origin, 'TWN');
  assert.equal(wang.position, 'P');
  for (const p of kbo.players) {
    if (p.ratings_source.startsWith('estimate_new_2026')) assert.ok(p.roster_source === 'kowiki_2026', p.name);
    assert.ok(!/[가-힣]/.test(p.name), `Hangul left in ${p.name}`);
  }
  // Every club can field nine and has a five-man rotation.
  for (const t of kbo.teams) {
    const roster = kbo.players.filter(p => p.team_id === t.id);
    assert.ok(roster.length <= 70, `${t.zh} has ${roster.length}`);
    assert.equal(autoLineup(roster).length, 9, t.zh);
    assert.ok(roster.filter(p => p.role === 'SP').length >= 5, t.zh);
  }
});

test('a world save started on the 2025 KBO roster keeps loading after the refresh', () => {
  assert.equal(LEGACY_ROSTERS.KBO[legacy.generated_at], 'roster_kbo_20251031.json');
  const oldBases = Object.fromEntries(W.LEAGUE_ORDER.map(id => [id, W.toWorldScale(id, id === 'KBO' ? legacy : read(`roster_${id.toLowerCase()}.json`))]));
  const w = W.makeWorld(oldBases, 'KBO', 'kbo:LG', 12);
  for (let i = 0; i < 3; i++) { W.userSeason(w).event = null; W.worldNextDay(w, W.worldDatas(w, oldBases)); }
  const saved = JSON.parse(JSON.stringify(w));
  assert.ok(!saved.leagues.KBO.playerPool, 'first-season saves keep no player pool');
  const newBases = {...oldBases, KBO: W.toWorldScale('KBO', kbo)};
  assert.ok(missingSavePlayers(saved.leagues.KBO, newBases.KBO).length > 0, 'the new roster alone would break this save');
  const needs = W.legacyRosterNeeds(saved, newBases);
  assert.deepEqual(needs.map(n => n.id), ['KBO']);
  W.attachLegacyPool(saved, 'KBO', W.toWorldScale('KBO', legacy));
  const back = W.restoreWorld(saved, newBases);
  const data = seasonData(newBases.KBO, back.leagues.KBO);
  assert.deepEqual(missingSavePlayers(back.leagues.KBO, data), []);
  assert.ok(data.players.some(p => p.id === 'kbo:66108'), 'old roster still in use');
  for (let i = 0; i < 3; i++) { W.userSeason(back).event = null; W.worldNextDay(back, W.worldDatas(back, newBases)); }
  assert.equal(back.leagues.KBO.day, 6);
  // A brand-new world uses the 2026 roster.
  const fresh = W.makeWorld(newBases, 'KBO', 'kbo:HH', 3);
  assert.ok(W.worldDatas(fresh, newBases).KBO.players.some(p => p.source_name === '왕옌청' && teamOf(fresh.leagues.KBO, p) === 'kbo:HH'));
  assert.deepEqual(W.legacyRosterNeeds(JSON.parse(JSON.stringify(fresh)), newBases), []);
});
