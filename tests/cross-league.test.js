import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRosters, loadReviewed, checkCrossLeague, crossLeagueCandidates} from '../data_pipeline/check_cross_league.mjs';

// A roster refresh can leave one person on two leagues' snapshots. Every candidate pair must
// be reviewed in data_pipeline/cross_league_reviewed.json (see data_pipeline/README.md).
test('cross-league duplicate candidates are all reviewed', () => {
  const rosters = loadRosters(), reviewed = loadReviewed();
  const {duplicates, unreviewed} = checkCrossLeague(rosters, reviewed);
  const line = c => `${c.birth} ${c.a.id} ${c.a.name} <-> ${c.b.id} ${c.b.name}`;
  assert.deepEqual(unreviewed.map(line), [], 'run node data_pipeline/check_cross_league.mjs and review these pairs');
  // Known duplicates, waiting for the next MLB/NPB refresh (docs/HANDOFF.md).
  assert.ok(duplicates.length <= (reviewed.duplicates || []).length);
});

test('the check finds a player copied into another league and ignores home players', () => {
  const p = (id, name, birth, extra = {}) => ({id, name, birth_date: birth, team_id: 't', ...extra});
  const rosters = {
    MLB: {players: [p('mlb:1', 'Sam Mover', '1996-06-24'), p('mlb:2', 'Same Birthday', '1990-01-01')]},
    KBO: {players: [p('kbo:1', '山姆', '1996-06-24', {origin: 'INTL'}), p('kbo:2', '金', '1990-01-01', {origin: 'KOR'})]},
    NPB: {players: []}, CPBL: {players: []},
  };
  assert.deepEqual(crossLeagueCandidates(rosters).map(c => c.key), ['kbo:1 mlb:1']);
  assert.equal(checkCrossLeague(rosters, {different: [['mlb:1', 'kbo:1']]}).unreviewed.length, 0);
  assert.equal(checkCrossLeague(rosters, {}).unreviewed.length, 1);
});
