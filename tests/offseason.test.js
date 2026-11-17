import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as W from '../dist/world.js';
import * as O from '../dist/offseason.js';
import {resolveEvent, teamOf, salaryOf} from '../dist/engine.js';

const raw = id => JSON.parse(fs.readFileSync(new URL(`../dist/data/roster_${id.toLowerCase()}.json`, import.meta.url), 'utf8'));
const bases = Object.fromEntries(W.LEAGUE_ORDER.map(id => [id, W.toWorldScale(id, raw(id))]));

test('origins, foreign players and league pay scales', () => {
  const npbForeign = bases.NPB.players.filter(p => W.isForeign(p, 'NPB')).length;
  assert.ok(npbForeign > 50 && npbForeign < 120, `NPB foreign players: ${npbForeign}`);
  assert.equal(bases.MLB.players.filter(p => W.isForeign(p, 'MLB')).length, 0, 'MLB has no foreign-player limit');
  const p = bases.MLB.players[0];
  assert.ok(O.leagueSalary(p, 'MLB') > O.leagueSalary(p, 'NPB') && O.leagueSalary(p, 'NPB') > O.leagueSalary(p, 'CPBL'));
  // Same money: MLB beats CPBL; a Taiwanese player values CPBL more than an American player does.
  const tw = {...p, origin: 'TWN'}, us = {...p, origin: 'INTL'};
  assert.ok(O.offerValue(us, 'MLB', 0, 1) > O.offerValue(us, 'CPBL', 0, 1));
  assert.ok(O.offerValue(tw, 'CPBL', 0, 1) > O.offerValue(us, 'CPBL', 0, 1));
});

test('a full offseason: market opens, bids resolve, players cross leagues, new year starts', () => {
  const w = W.makeWorld(bases, 'CPBL', 'cpbl:ACN', 9);
  for (const id of W.LEAGUE_ORDER) assert.ok(Object.keys(w.leagues[id].contracts).length > 400);
  // Club money follows the league scale.
  assert.ok(w.leagues.CPBL.finance['cpbl:ACN'].cash < w.leagues.MLB.finance['mlb:147'].cash / 4);
  while (W.userSeason(w).phase !== 'finished') {
    const u = W.userSeason(w);
    if (u.event) resolveEvent(u, W.worldDatas(w, bases).CPBL, 0);
    W.worldNextDay(w, W.worldDatas(w, bases));
  }
  const o = O.startOffseason(w, bases);
  assert.ok(W.worldFinished(o));
  assert.ok(o.offseason.freeAgents.length > 50);
  assert.ok(o.offseason.freeAgents.every(r => r.age > 26), 'young players stay under club control');
  assert.ok(!w.offseason, 'input world untouched');
  const datas = W.worldDatas(o, bases);
  // Release the club's foreign players so a foreign signing fits under the quota, then bid big.
  for (const r of o.offseason.userExpiring) O.setExpiringDecision(o, r.id, true);
  const domestic = o.offseason.freeAgents.find(r => r.origin === 'TWN' || r.league === 'CPBL');
  const target = domestic || o.offseason.freeAgents.at(-1);
  assert.equal(O.setBid(o, datas, target.id, {bonus: 999999999999, years: 2}).ok, false, 'cannot bid more cash than the club has');
  const ok = O.setBid(o, datas, target.id, {bonus: 2000000, years: 2});
  assert.ok(ok.ok, ok.reason);
  const cashBefore = o.leagues.CPBL.finance['cpbl:ACN'].cash;
  const n = O.completeOffseason(o, bases);
  assert.equal(n.year, w.year + 1);
  assert.ok(!n.offseason);
  const market = W.userSeason(n).offseason.market;
  assert.ok(market.total > 20 && market.cross.length > 0, JSON.stringify({total: market.total, cross: market.cross.length}));
  const nd = W.worldDatas(n, bases);
  for (const m of market.cross) {
    const p = nd[m.toLeague].players.find(q => q.id === m.id);
    if (!p) continue; // may have retired in the rollover
    assert.equal(p.league, m.toLeague);
    assert.equal(teamOf(n.leagues[m.toLeague], p), m.toTeam);
    assert.ok(!nd[m.fromLeague].players.some(q => q.id === m.id), 'player left his old league');
  }
  for (const id of ['NPB', 'CPBL']) for (const t of nd[id].teams) {
    const signedForeign = market.moves.filter(m => m.toTeam === t.id && W.isForeign(nd[id].players.find(q => q.id === m.id) || {origin: 'JPN'}, id)).length;
    assert.ok(signedForeign <= O.FOREIGN_QUOTA[id]);
  }
  if (market.userSigned.length) assert.ok(market.bonusPaid > 0 && n.leagues.CPBL.offseason.market.bonusPaid <= cashBefore);
  // Rookies get league-appropriate names and contracts carry over.
  assert.ok(nd.NPB.players.some(p => p.simulated && !/[A-Za-z]/.test(p.name)));
  assert.ok(nd.MLB.players.some(p => p.simulated && /[A-Za-z]/.test(p.name)));
  assert.ok(Object.keys(n.leagues.MLB.contracts).length >= nd.MLB.players.length - 5);
  assert.ok(salaryOf(nd.CPBL.players[0]) < salaryOf({...nd.CPBL.players[0], league: 'MLB'}));
  // Every club can still field a team, and the new season actually plays.
  for (const id of W.LEAGUE_ORDER) for (const t of nd[id].teams) assert.equal(O.rosterShortage(nd[id].players.filter(p => teamOf(n.leagues[id], p) === t.id)), null, `${t.zh} roster`);
  assert.ok(Array.isArray(market.postings) && Array.isArray(market.returns));
  for (let i = 0; i < 5; i++) { const u = W.userSeason(n); if (u.event) resolveEvent(u, W.worldDatas(n, bases).CPBL, 0); W.worldNextDay(n, W.worldDatas(n, bases)); }
  assert.ok(W.LEAGUE_ORDER.every(id => n.leagues[id].day >= 4));
  const back = W.restoreWorld(JSON.parse(JSON.stringify(n)), bases);
  assert.equal(back.year, n.year);
  assert.ok(JSON.stringify(n).length < 3_000_000);
});
