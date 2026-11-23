import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../dist/career.js?v=36';
import {makeSeason, nextDay, resolveEvent} from '../dist/engine.js?v=36';
import {setDifficulty, ensureFront, gmOf, jobLost, jobOffers, takeJob} from '../dist/front.js?v=36';

const base = JSON.parse(fs.readFileSync(new URL('../dist/data/roster_cpbl.json', import.meta.url), 'utf8'));
const h = (year, o = {}) => ({year, teamId: 'cpbl:a', team: 'A 隊', league: 'CPBL', w: 41, l: 40, grade: 60, confidence: 60, champion: false, fired: false, difficulty: 'normal', playoffs: false, rounds: 0, budgetPct: .5, share: 1, titleIds: [], ...o});
function play(s, until = () => false) {
  for (let i = 0; i < 300 && s.phase !== 'finished' && !jobLost(s) && !until(s); i++) { if (s.event) resolveEvent(s, base, s.event.choices.length - 1); nextDay(s, base); }
  return s;
}

test('GM names are cleaned and kept unique; the profile validates', () => {
  const p = C.blankProfile();
  assert.equal(C.addGm(p, '  阿明  ').name, '阿明');
  assert.equal(C.addGm(p, '阿明').name, '阿明 (2)');
  assert.equal(C.addGm(p, '').name, '無名 GM');
  assert.equal(C.addGm(p, 'x'.repeat(30)).name.length, C.NAME_MAX);
  assert.equal(C.normalizeProfile(JSON.parse(JSON.stringify(p))).gms.length, 4);
  assert.throws(() => C.normalizeProfile({kind: 'world'}), /生涯檔/);
});

test('syncing the same seasons twice never double-counts', () => {
  const p = C.blankProfile(), g = C.addGm(p, 'GM');
  const hist = [h(2028, {w: 50, l: 31, champion: true, playoffs: true, rounds: 2}), h(2027)];
  assert.equal(C.syncWorld(p, g.id, 'w1', hist, 'CPBL'), true);
  assert.equal(C.syncWorld(p, g.id, 'w1', hist, 'CPBL'), false);
  assert.equal(g.seasons.length, 2);
  assert.equal(C.careerTotals(g).w, 91);
  assert.equal(C.careerTotals(g).champions, 1);
  // A different world (a restart) adds its own seasons.
  C.syncWorld(p, g.id, 'w2', [h(2027)], 'CPBL');
  assert.equal(C.careerTotals(g).seasons, 3);
  // Re-importing the same file merges nothing new.
  const copy = JSON.parse(JSON.stringify(p));
  assert.deepEqual(C.mergeProfiles(p, copy), {added: 0, seasons: 0});
  const other = C.blankProfile(); assert.deepEqual(C.mergeProfiles(other, copy), {added: 1, seasons: 3});
});

test('reputation rises with winning, titles and difficulty, falls with firing, stays in 0..100', () => {
  const rep = list => { const p = C.blankProfile(), g = C.addGm(p, 'G'); C.syncWorld(p, g.id, 'w', [...list].reverse(), 'CPBL'); return C.reputationOf(g); };
  assert.ok(rep([h(2027, {w: 55, l: 26})]) > rep([h(2027, {w: 41, l: 40})]));
  assert.ok(rep([h(2027, {w: 41, l: 40})]) > rep([h(2027, {w: 25, l: 56})]));
  assert.ok(rep([h(2027, {champion: true, playoffs: true, rounds: 2})]) > rep([h(2027, {playoffs: true})]));
  assert.ok(rep([h(2027, {w: 55, l: 26, difficulty: 'hell'})]) > rep([h(2027, {w: 55, l: 26, difficulty: 'easy'})]));
  assert.equal(rep([h(2027, {w: 25, l: 56, difficulty: 'hell'})]), rep([h(2027, {w: 25, l: 56, difficulty: 'easy'})]), 'difficulty only multiplies gains');
  assert.ok(rep([h(2027, {fired: true})]) < rep([h(2027)]));
  assert.ok(rep([h(2027, {league: 'MLB', w: 55, l: 26})]) > rep([h(2027, {w: 55, l: 26})]));
  const dynasty = Array.from({length: 30}, (_, i) => h(2027 + i, {w: 70, l: 11, champion: true, playoffs: true, rounds: 3, difficulty: 'hell', league: 'MLB'}));
  assert.ok(rep(dynasty) <= 100 && rep(dynasty) >= 90);
  const disaster = Array.from({length: 10}, (_, i) => h(2027 + i, {w: 10, l: 71, fired: true}));
  assert.ok(rep(disaster) >= 0);
  assert.equal(C.reputationLevel(95), '傳奇'); assert.equal(C.reputationLevel(10), '無名');
});

test('pay follows league ranges and the share of the season worked', () => {
  const pay = o => C.payFor(C.seasonRecord('w', h(2027, o)));
  const [lo, hi] = C.SALARY_RANGE.MLB;
  assert.equal(pay({league: 'MLB', budgetPct: 0}).salary, lo);
  assert.equal(pay({league: 'MLB', budgetPct: 1}).salary, hi);
  assert.ok(pay({league: 'CPBL'}).salary < pay({league: 'NPB'}).salary);
  assert.equal(pay({share: .5}).salary, Math.round(pay({}).salary / 2 / 1000) * 1000);
  assert.equal(pay({}).bonus, 0);
  assert.ok(pay({champion: true, playoffs: true, rounds: 2}).bonus > pay({playoffs: true}).bonus);
});

test('timeline and achievements come from the records', () => {
  const p = C.blankProfile(), g = C.addGm(p, 'G');
  const hist = [h(2027), h(2028, {fired: true, midseason: true, w: 15, l: 25}), h(2028, {teamId: 'cpbl:b', team: 'B 隊', joined: true, playoffs: true, w: 30, l: 11}),
    h(2029, {teamId: 'cpbl:b', team: 'B 隊', champion: true, playoffs: true, rounds: 2, difficulty: 'hell'}), h(2030, {teamId: 'cpbl:b', team: 'B 隊', champion: true, playoffs: true, rounds: 2})];
  C.syncWorld(p, g.id, 'w', [...hist].reverse(), 'CPBL');
  const st = C.stints(g);
  assert.deepEqual(st.map(x => [x.team, x.from, x.to, x.ended || '']), [['A 隊', 2027, 2028, '季中解職'], ['B 隊', 2028, 2030, '']]);
  const ids = C.achievements(g).map(a => a.id);
  for (const id of ['firstWin', 'firstPlayoffs', 'firstTitle', 'twoPeat', 'firefighter', 'comeback', 'hellChampion']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('threePeat') && !ids.includes('overseas'));
  assert.equal(C.achievements(g).find(a => a.id === 'twoPeat').year, 2030);
});

test('a real season records league, playoffs and pay; a mid-season move splits the record', () => {
  const s = makeSeason(base, base.teams[0].id, 7);
  setDifficulty(s, 'hard', {initial: true}); ensureFront(s, base);
  s.board.confidence = 3;
  play(s);
  assert.equal(jobLost(s), true);
  takeJob({teamId: s.teamId}, s, base, jobOffers(s, base)[0].id);
  play(s);
  const hist = gmOf(s).history, games = s.schedule.length;
  assert.equal(hist.length, 2);
  const [joined, fired] = hist;
  assert.equal(fired.midseason, true);
  assert.equal(joined.joined, true);
  assert.equal(joined.league, 'CPBL');
  assert.ok(fired.w + fired.l + joined.w + joined.l <= games + 1, 'the two parts do not overlap');
  assert.ok(joined.w + joined.l < games * .7);
  assert.ok(joined.share > .3 && joined.share < .7 && fired.share > .3 && fired.share < .7);
  const p = C.blankProfile(), g = C.addGm(p, 'G');
  C.syncWorld(p, g.id, 'w', hist, 'CPBL');
  const [lo, hi] = C.SALARY_RANGE.CPBL;
  for (const e of g.seasons) assert.ok(e.salary >= lo * e.share - 1000 && e.salary <= hi * e.share + 1000, `${e.salary}`);
  assert.equal(typeof joined.playoffs, 'boolean');
  assert.equal(C.stints(g).length, 2);
});
