import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as W from '../dist/world.js?v=38';
import * as O from '../dist/offseason.js?v=38';
import * as J from '../dist/jobs.js?v=38';
import {careerOf, careerTotals} from '../dist/career.js?v=38';
import {resolveEvent, positionsOf} from '../dist/engine.js?v=38';
import {gmOf, ensureFront, setDifficulty, jobLost} from '../dist/front.js?v=38';

const raw = id => JSON.parse(fs.readFileSync(new URL(`../dist/data/roster_${id.toLowerCase()}.json`, import.meta.url), 'utf8'));
const bases = Object.fromEntries(W.LEAGUE_ORDER.map(id => [id, W.toWorldScale(id, raw(id))]));
const hist = (year, o = {}) => ({year, teamId: 'x', team: 'X', league: 'MLB', w: 41, l: 40, grade: 60, champion: false, fired: false, difficulty: 'normal', playoffs: false, rounds: 0, budgetPct: .5, share: 1, titleIds: [], ...o});
function world(league = 'CPBL', seed = 3) {
  const w = W.makeWorld(bases, league, bases[league].teams[0].id, seed);
  w.gm = {name: '測試', createdAt: '2026-11-24T00:00:00.000Z'};
  const s = W.userSeason(w); setDifficulty(s, 'normal', {initial: true}); ensureFront(s, W.worldDatas(w, bases)[league]);
  J.ensureContract(w, W.worldDatas(w, bases));
  return w;
}
function playUser(w, until = s => s.phase === 'finished') {
  let datas = W.worldDatas(w, bases);
  for (let i = 0; i < 400; i++) {
    const s = W.userSeason(w);
    if (until(s) || jobLost(s)) break;
    if (s.event) resolveEvent(s, datas[w.userLeague], s.event.choices.length - 1);
    W.worldNextDay(w, datas, {});
  }
  return w;
}
const legalLineups = (w) => { const s = W.userSeason(w), data = W.worldDatas(w, bases)[w.userLeague]; const f = s.teams[w.teamId].fielding; return Object.keys(f || {}).length; };

test('a new GM gets a 3-year contract at a league-scaled salary', () => {
  const w = world('CPBL'), c = gmOf(W.userSeason(w)).contract;
  assert.equal(c.years, 3); assert.equal(c.teamId, w.teamId); assert.equal(c.from, W.userSeason(w).year);
  assert.ok(c.salary >= 120000 && c.salary <= 400000);
  assert.equal(J.yearsLeft(c, c.from), 3);
});

test('offers follow reputation: weak same-league clubs first, other leagues only for top GMs', () => {
  const w = world('CPBL'), datas = W.worldDatas(w, bases), g = gmOf(W.userSeason(w));
  const low = J.gmOffers(w, datas, 'expired');
  assert.ok(low.length >= 1);
  assert.ok(low.filter(o => !o.own).every(o => o.league === 'CPBL' && o.tier === 'weak'), JSON.stringify(low));
  assert.deepEqual(J.gmOffers(w, datas, 'expired'), low, 'seeded: the same situation gives the same offers');
  assert.equal(J.gmOffers(w, datas, 'poach').length, 0, 'an unknown GM is not poached');
  g.history = Array.from({length: 12}, (_, i) => hist(2014 + i, {w: 60, l: 21, champion: true, playoffs: true, rounds: 3, grade: 95, difficulty: 'hell'})).reverse();
  assert.ok(J.reputationNow(w) >= 90);
  const top = J.gmOffers(w, datas, 'expired');
  assert.ok(top.some(o => o.league !== 'CPBL'), JSON.stringify(top));
  const poach = J.gmOffers(w, datas, 'poach');
  assert.ok(poach.length >= 1);
  for (const o of poach) { assert.equal(o.blocked, !o.stepUp); assert.ok(o.compensation >= 0); }
});

test('a cross-league move hands the GM role to the new league and the world keeps running', () => {
  const w = world('CPBL', 5), s = W.userSeason(w), g = gmOf(s);
  g.history = Array.from({length: 12}, (_, i) => hist(2014 + i, {w: 60, l: 21, champion: true, playoffs: true, rounds: 3, grade: 95, difficulty: 'hell'})).reverse();
  playUser(w);
  assert.equal(s.phase, 'finished');
  g.contract.years = 1; // let the contract run out this season
  const m = J.ensureMarket(w, W.worldDatas(w, bases));
  assert.equal(m.reason, 'expired');
  const idx = m.offers.findIndex(o => o.league !== 'CPBL' && !o.own);
  assert.ok(idx >= 0, JSON.stringify(m.offers));
  const o = m.offers[idx], oldTeam = w.teamId;
  J.acceptOffer(w, bases, idx);
  assert.equal(w.userLeague, o.league);
  assert.equal(w.teamId, o.teamId);
  const ns = W.userSeason(w);
  assert.equal(ns.aiOnly, undefined);
  assert.equal(ns.teamId, o.teamId);
  assert.equal(w.leagues.CPBL.aiOnly, true);
  assert.equal(w.leagues.CPBL.teamId, null);
  assert.ok(gmOf(ns).history.length >= 13, 'career history moves with the GM');
  assert.deepEqual(gmOf(ns).contract, {teamId: o.teamId, league: o.league, from: s.year + 1, years: o.years, salary: o.salary});
  assert.ok(J.marketDecided(w));
  assert.equal(J.marketReason(w), null, 'no new poaching offers after signing for next season');
  // Save round trip, offseason, a few days of the new season.
  const back = W.restoreWorld(JSON.parse(W.packWorld(w, bases)), bases);
  const next = O.advanceWorld(back, bases);
  assert.equal(next.userLeague, o.league); assert.equal(next.teamId, o.teamId);
  playUser(next, x => x.day >= 3);
  assert.equal(W.userSeason(next).day, 3);
  assert.equal(legalLineups(next), 9);
  const c = careerOf(next, gmOf(W.userSeason(next)).history);
  assert.ok(c.seasons.some(e => e.teamId === oldTeam && e.league === 'CPBL'));
});

test('poaching: the new club pays the old one, and leaving early costs reputation', () => {
  const w = world('CPBL', 7), s = W.userSeason(w), g = gmOf(s);
  g.history = Array.from({length: 12}, (_, i) => hist(2014 + i, {w: 60, l: 21, champion: true, playoffs: true, rounds: 3, grade: 95, difficulty: 'hell'})).reverse();
  playUser(w);
  const m = J.ensureMarket(w, W.worldDatas(w, bases));
  assert.equal(m.reason, 'poach');
  const blocked = m.offers.findIndex(o => o.blocked);
  if (blocked >= 0) assert.throws(() => J.acceptOffer(w, bases, blocked), /不放人/);
  W.finishWorld(w, W.worldDatas(w, bases)); // no more days settle while the move happens
  const idx = m.offers.findIndex(o => !o.blocked);
  assert.ok(idx >= 0, JSON.stringify(m.offers));
  const o = m.offers[idx], oldTeam = w.teamId, repBefore = J.reputationNow(w);
  const before = [w.leagues.CPBL.finance[oldTeam].cash, w.leagues[o.league].finance[o.teamId].cash];
  assert.ok(o.compensation > 0);
  J.acceptOffer(w, bases, idx);
  assert.equal(w.leagues.CPBL.finance[oldTeam].cash, before[0] + o.compensation);
  assert.equal(w.leagues[o.league].finance[o.teamId].cash, before[1] - o.compensation);
  assert.equal(gmOf(W.userSeason(w)).history[0].leftEarly, true);
  assert.ok(J.reputationNow(w) < repBefore);
});

test('fired: the rest of the contract is paid out; waiting a season, then offers', () => {
  const w = world('CPBL', 9), s = W.userSeason(w);
  setDifficulty(s, 'hard'); s.board.confidence = 2;
  playUser(w);
  assert.equal(jobLost(s), true);
  const fired = careerOf(w, gmOf(s).history).seasons.at(-1);
  assert.equal(fired.fired, true);
  assert.equal(fired.severance, fired.owed);
  assert.ok(fired.owed > 0, 'two more seasons were owed');
  assert.ok(careerTotals(careerOf(w, gmOf(s).history)).earnings > fired.salary);
  assert.equal(gmOf(s).contract, null);
  const m = J.ensureMarket(w, W.worldDatas(w, bases));
  assert.equal(m.reason, 'midseason');
  assert.ok(m.offers.every(o => o.league === 'CPBL'));
  J.startWaiting(w);
  assert.equal(J.marketReason(w), null);
  assert.equal(s.aiOnly, true);
  playUser(w);
  assert.equal(s.phase, 'finished');
  assert.equal(gmOf(s).history.filter(h => h.year === s.year && !h.unemployed).length, 1, 'no season review while away');
  w.gm.waited = true;
  assert.equal(J.marketReason(w), 'waiting');
  const mk = J.ensureMarket(w, W.worldDatas(w, bases));
  if (mk.offers.length) {
    J.acceptOffer(w, bases, 0);
    assert.equal(w.gm.unemployed, undefined);
    assert.equal(W.userSeason(w).aiOnly, undefined);
    assert.ok(gmOf(W.userSeason(w)).contract);
  }
});

test('waiting a full season: AI runs the club, the idle year is recorded, then the market reopens', () => {
  const w0 = world('CPBL', 11), s0 = W.userSeason(w0);
  setDifficulty(s0, 'hard'); s0.board.confidence = 100;
  playUser(w0);
  assert.equal(s0.phase, 'finished');
  s0.board.result.fired = true; s0.board.result.handled = false; // fired at season's end
  J.startWaiting(w0);
  const w = J.startIdleSeason(w0, bases), s = W.userSeason(w);
  assert.equal(s.year, s0.year + 1);
  assert.equal(s.aiOnly, true);
  assert.equal(J.marketReason(w), null);
  playUser(w);
  assert.equal(s.phase, 'finished');
  assert.equal(s.event, null);
  J.recordIdleSeason(w);
  J.recordIdleSeason(w);
  const c = careerOf(w, gmOf(s).history);
  assert.equal(c.seasons.filter(e => e.unemployed).length, 1, 'recorded once');
  assert.equal(careerTotals(c).seasons, 1, 'an idle year is not a season worked');
  assert.equal(J.marketReason(w), 'waiting');
  assert.ok(Array.isArray(J.ensureMarket(w, W.worldDatas(w, bases)).offers));
  const back = W.restoreWorld(JSON.parse(W.packWorld(w, bases)), bases);
  assert.equal(W.userSeason(back).aiOnly, true, 'still away after a reload');
});
