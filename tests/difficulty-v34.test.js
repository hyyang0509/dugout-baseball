import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSeason, nextDay, resolveEvent} from '../dist/engine.js?v=40';
import {DIFFICULTY, setDifficulty, canRaiseDifficulty, difficultyOf, ensureFront, gmOf, boardOf, jobLost, jobOffers, takeJob, midSeasonReview} from '../dist/front.js?v=40';

const base = JSON.parse(fs.readFileSync(new URL('../dist/data/roster_cpbl.json', import.meta.url), 'utf8'));
const team = base.teams[0].id;
function play(s, until = () => false) {
  for (let i = 0; i < 300 && s.phase !== 'finished' && !jobLost(s) && !until(s); i++) {
    if (s.event) resolveEvent(s, base, s.event.choices.length - 1);
    nextDay(s, base);
  }
  return s;
}
const fresh = (level, seed = 5) => { const s = makeSeason(base, team, seed); if (level) setDifficulty(s, level, {initial: true}); ensureFront(s, base); return s; };

test('levels match the agreed table; old saves count as easy with the old rules', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(DIFFICULTY).map(([k, d]) => [k, [d.start, d.fire, d.penalty, d.midFire]])),
    {easy: [60, 25, 1, null], normal: [55, 30, 1.3, null], hard: [45, 32, 1.6, 20], hell: [42, 35, 2, 25]});
  const old = makeSeason(base, team, 9);
  old.gm = {career: {seasons: 0, champions: 0, fired: 0}, season: {year: old.year}, titles: [], history: []};
  ensureFront(old, base);
  assert.equal(difficultyOf(old), 'easy');
  assert.equal(old.board.confidence, 60);
});

test('a new game starts at the level\'s confidence', () => {
  for (const [id, d] of Object.entries(DIFFICULTY)) assert.equal(boardOf(fresh(id), base).confidence, d.start, id);
});

test('lowering works any time; raising only before the first game; the season keeps its lowest level', () => {
  const s = fresh('normal');
  assert.equal(canRaiseDifficulty(s), true);
  assert.equal(setDifficulty(s, 'hell').ok, true, 'day 0: raise allowed');
  assert.equal(gmOf(s).season.low, 'hell');
  assert.equal(s.board.confidence, 42, 'first game not played yet: the board starts at the new level');
  play(s, x => x.day >= 3);
  assert.equal(canRaiseDifficulty(s), false);
  assert.equal(setDifficulty(s, 'easy').ok, true);
  assert.equal(setDifficulty(s, 'hard').ok, false, 'no raising mid-season');
  assert.equal(difficultyOf(s), 'easy');
  assert.equal(gmOf(s).season.low, 'easy');
  s.board.confidence = 100;
  play(s);
  assert.equal(s.phase, 'finished');
  assert.equal(gmOf(s).history[0].difficulty, 'easy', 'career records the lowest level played');
  assert.equal(setDifficulty(s, 'hard').ok, true, 'between seasons raising is allowed again');
});

test('hard: a low-confidence GM is fired on the spot at mid-season and must take a job to go on', () => {
  const s = fresh('hard');
  s.board.confidence = 4;
  play(s);
  assert.equal(s.phase, 'regular');
  assert.equal(jobLost(s), true);
  assert.equal(s.board.result.midseason, true);
  assert.ok(s.day >= Math.floor(81 / 2) && s.day <= Math.floor(81 / 2) + 1, `fired on day ${s.day}`);
  assert.equal(gmOf(s).career.fired, 1);
  assert.equal(gmOf(s).history[0].midseason, true);
  const w = {teamId: s.teamId};
  const offer = jobOffers(s, base)[0];
  takeJob(w, s, base, offer.id);
  assert.equal(jobLost(s), false);
  assert.equal(s.teamId, offer.id);
  assert.equal(s.board.joinedDay != null, true);
  s.board.confidence = 1;
  play(s);
  assert.equal(s.phase, 'finished');
  assert.equal(s.board.result.fired, false, 'a mid-season hire is not fired at season end');
  assert.equal(gmOf(s).career.fired, 1);
});

test('hell reviews three times mid-season; easy and normal never do', () => {
  const count = s => s.news.filter(n => /董事會季中考核/.test(n.title)).length;
  const h = fresh('hell'); h.board.confidence = 100; play(h, x => x.phase !== 'regular');
  assert.equal(count(h), 3);
  for (const id of ['easy', 'normal']) { const s = fresh(id); s.board.confidence = 3; play(s, x => x.phase !== 'regular'); assert.equal(count(s), 0, id); assert.equal(jobLost(s), false, id); }
});

test('losses are multiplied by the level\'s penalty, gains are not', () => {
  const run = level => { const s = fresh(level, 21); s.board.confidence = 50; play(s, x => x.day >= 41); s.board.checks = 0; s.board.applied = 0; s.board.result = null; s.board.confidence = 50; return midSeasonReview(s, base); };
  // Same seed, same day: hard and hell see the same grade, so their deltas differ only by the penalty.
  const hd = run('hard'), hl = run('hell');
  if (hd.delta < 0) assert.ok(hl.delta <= hd.delta, `${hl.delta} vs ${hd.delta}`);
  else assert.ok(hd.delta >= 0 && hl.delta >= 0);
});

test('harder boards set more and tougher goals; easy keeps the old goals', () => {
  const goals = id => boardOf(fresh(id), base).goals;
  const easy = goals('easy'), normal = goals('normal'), hard = goals('hard'), hell = goals('hell');
  assert.equal(easy.length, 3);
  assert.equal(normal.length, 3);
  assert.equal(hard.length, 4);
  assert.equal(hell.length, 5);
  assert.ok(hard.some(g => g.type === 'rank') && hell.some(g => g.type === 'rank'));
  for (const g of [easy, normal, hard, hell]) assert.equal(g.reduce((a, x) => a + x.weight, 0), 100);
  const wins = g => g.find(x => x.type === 'wins')?.target ?? 0;
  assert.ok(wins(easy) < wins(normal) && wins(normal) < wins(hard) && wins(hard) < wins(hell), [easy, normal, hard, hell].map(wins).join(','));
});
