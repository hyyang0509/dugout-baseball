import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as W from '../dist/world.js';
import * as O from '../dist/offseason.js';
import {overall} from '../dist/engine.js';

const raw = id => JSON.parse(fs.readFileSync(new URL(`../dist/data/roster_${id.toLowerCase()}.json`, import.meta.url), 'utf8'));
const bases = Object.fromEntries(W.LEAGUE_ORDER.map(id => [id, W.toWorldScale(id, raw(id))]));

test('other-league players are estimates until scouted', () => {
  const w = W.makeWorld(bases, 'CPBL', 'cpbl:ACN', 3);
  const mine = bases.CPBL.players[0], star = bases.MLB.players.find(p => p.name === 'Aaron Judge');
  assert.ok(W.isKnown(w, mine, 'CPBL'));
  assert.ok(!W.isKnown(w, star, 'MLB'));
  for (const key of Object.keys(star.ratings)) {
    const v = W.ratingView(w, star, 'MLB', key);
    if (key === 'stamina' && star.ratings.stamina == null) continue;
    assert.ok(!v.known && v.high - v.low <= 8 && v.low <= star.ratings[key] + 8 && v.high >= star.ratings[key] - 8, key);
  }
  const est = W.ovrView(w, star, 'MLB');
  assert.equal(est.value % 5, 0);
  assert.ok(Math.abs(est.value - overall(star)) <= 7);
  const cash = W.userSeason(w).finance['cpbl:ACN'].cash;
  const r = W.startScouting(w, star, 'MLB');
  assert.ok(r.ok && !r.instant);
  assert.ok(W.userSeason(w).finance['cpbl:ACN'].cash < cash, 'scouting costs money');
  assert.equal(W.startScouting(w, star, 'MLB').ok, false, 'no double scouting');
  assert.equal(W.startScouting(w, mine, 'CPBL').ok, false, 'own league needs no scout');
  const datas = W.worldDatas(w, bases);
  for (let i = 0; i < W.SCOUT_DAYS; i++) { const u = W.userSeason(w); u.event = null; W.worldNextDay(w, datas); }
  assert.ok(W.isKnown(w, star, 'MLB'));
  assert.equal(W.ratingView(w, star, 'MLB', 'power').value, star.ratings.power);
  assert.ok(W.userSeason(w).news.some(n => n.title.includes('球探報告')));
  // Saved and restored, the report survives.
  assert.ok(W.isKnown(W.restoreWorld(JSON.parse(JSON.stringify(w)), bases), star, 'MLB'));
});

test('posting is MLB-only and roster shortages are detected', () => {
  assert.equal(O.rosterShortage([]), 'C');
  const w = W.makeWorld(bases, 'NPB', 'npb:h', 4);
  w.offseason = {year: 2026, freeAgents: [{id: 'x', league: 'CPBL', teamId: 'cpbl:ACN', posting: true, origin: 'TWN', ovr: 55}], resigned: {}, userExpiring: [], postingRequests: [], bids: {}};
  const r = O.bidStatus(w, W.worldDatas(w, bases), 'x', {bonus: 0, years: 1});
  assert.equal(r.ok, false);
  assert.match(r.reason, /美職/);
});
