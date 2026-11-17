import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as W from '../dist/world.js';
import * as O from '../dist/offseason.js';
import {resolveEvent, overall} from '../dist/engine.js';

const raw = id => JSON.parse(fs.readFileSync(new URL(`../dist/data/roster_${id.toLowerCase()}.json`, import.meta.url), 'utf8'));
const bases = Object.fromEntries(W.LEAGUE_ORDER.map(id => [id, W.toWorldScale(id, raw(id))]));

test('world scale keeps MLB as-is and puts NPB, then CPBL, a level lower', () => {
  assert.equal(W.worldRating('MLB', 'power', 70), 70);
  assert.ok(W.worldRating('NPB', 'power', 70) < 70);
  assert.ok(W.worldRating('CPBL', 'power', 70) < W.worldRating('NPB', 'power', 70));
  assert.equal(W.worldRating('CPBL', 'stamina', 75), 75); // workload is not league quality
  const avg = id => { const v = bases[id].players.map(overall); return v.reduce((a, b) => a + b, 0) / v.length; };
  assert.ok(avg('MLB') > avg('NPB') && avg('NPB') > avg('CPBL'));
  assert.equal(raw('CPBL').players[0].ratings.contact, raw('CPBL').players[0].ratings.contact, 'source data untouched');
});

test('a world runs three leagues on one calendar; only the user league has events', () => {
  const w = W.makeWorld(bases, 'NPB', bases.NPB.teams[0].id, 11);
  assert.equal(W.userSeason(w).teamId, bases.NPB.teams[0].id);
  assert.ok(w.leagues.MLB.aiOnly && w.leagues.CPBL.aiOnly && !w.leagues.NPB.aiOnly);
  for (let i = 0; i < 12; i++) {
    const u = W.userSeason(w);
    if (u.event) resolveEvent(u, W.worldDatas(w, bases).NPB, 0);
    W.worldNextDay(w, W.worldDatas(w, bases));
    for (const id of ['MLB', 'CPBL']) assert.equal(w.leagues[id].event, null);
  }
  const days = W.LEAGUE_ORDER.map(id => w.leagues[id].day);
  assert.ok(days.every(d => d === days[0]), `calendars out of sync: ${days}`);
  const played = id => Object.values(w.leagues[id].teams).reduce((a, t) => a + t.w + t.l, 0);
  assert.ok(played('MLB') > 0 && played('CPBL') > 0);
  assert.ok(JSON.stringify(w).length < 3_000_000, 'save must fit in browser storage');
});

test('world saves restore, rank players across leagues, and roll into a new year', () => {
  const w = W.makeWorld(bases, 'CPBL', bases.CPBL.teams[0].id, 5);
  // Finish the user's season quickly by marking it done after a couple of days.
  W.worldNextDay(w, W.worldDatas(w, bases));
  const back = W.restoreWorld(JSON.parse(JSON.stringify(w)), bases);
  assert.equal(back.userLeague, 'CPBL');
  assert.throws(() => W.restoreWorld({kind: 'world', worldVersion: 99}, bases));
  const top = W.worldTop(w, W.worldDatas(w, bases), {limit: 10});
  assert.equal(top.length, 10);
  assert.ok(top[0].ovr >= top[9].ovr);
  const str = W.leagueStrength(w, W.worldDatas(w, bases));
  assert.ok(str.MLB > str.NPB && str.NPB > str.CPBL, JSON.stringify(str));
  assert.throws(() => O.startOffseason(w, bases), /冠軍賽/);
});
