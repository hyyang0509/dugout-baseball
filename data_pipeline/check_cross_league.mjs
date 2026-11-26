// Cross-league duplicate check: the same person on two leagues' roster snapshots.
//
// Roster files are refreshed at different dates, so a player who changed leagues can sit
// on both (e.g. the MLB snapshot predates his KBO signing). Names cannot be compared
// across leagues (English, katakana, hangul, Chinese transliteration), so candidates are
// pairs from different leagues with the same birth date and the same origin, where at
// least one of them is an import in his league. Each candidate must be reviewed once in
// cross_league_reviewed.json, as "duplicates" (fix at the next roster refresh) or
// "different" (different people). tests/cross-league.test.js fails on unreviewed pairs.
//
// Run after any roster update:  node data_pipeline/check_cross_league.mjs
import fs from 'node:fs';
import {originOf} from '../dist/world.js';

export const LEAGUE_FILES = {MLB: 'roster_mlb.json', NPB: 'roster_npb.json', KBO: 'roster_kbo.json', CPBL: 'roster_cpbl.json'};
const HOME = {MLB: 'INTL', NPB: 'JPN', KBO: 'KOR', CPBL: 'TWN'};
const pairKey = (a, b) => [a, b].sort().join(' ');

export function loadRosters(dir = new URL('../dist/data/', import.meta.url)) {
  return Object.fromEntries(Object.entries(LEAGUE_FILES).map(([lg, f]) => [lg, JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'))]));
}
export function loadReviewed(file = new URL('./cross_league_reviewed.json', import.meta.url)) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Candidate pairs: [{key, birth, a:{league,id,name,origin}, b:{...}}], sorted by key. */
export function crossLeagueCandidates(rosters) {
  const byBirth = new Map();
  for (const [league, data] of Object.entries(rosters)) {
    for (const p of data.players || []) {
      if (!p.birth_date) continue;
      const row = {league, id: p.id, name: p.name, origin: originOf(league, p)};
      if (!byBirth.has(p.birth_date)) byBirth.set(p.birth_date, []);
      byBirth.get(p.birth_date).push(row);
    }
  }
  const out = [];
  for (const [birth, rows] of byBirth) {
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (a.league === b.league || a.origin !== b.origin) continue;
      if (a.origin === HOME[a.league] && b.origin === HOME[b.league]) continue;
      out.push({key: pairKey(a.id, b.id), birth, a, b});
    }
  }
  return out.sort((x, y) => x.key.localeCompare(y.key));
}

/** {duplicates, unreviewed}: reviewed duplicates still on both rosters, and pairs nobody has looked at. */
export function checkCrossLeague(rosters, reviewed) {
  const dup = new Set((reviewed.duplicates || []).map(x => pairKey(x.ids[0], x.ids[1])));
  const diff = new Set((reviewed.different || []).map(x => pairKey(x[0], x[1])));
  const cands = crossLeagueCandidates(rosters);
  return {duplicates: cands.filter(c => dup.has(c.key)), unreviewed: cands.filter(c => !dup.has(c.key) && !diff.has(c.key))};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const {duplicates, unreviewed} = checkCrossLeague(loadRosters(), loadReviewed());
  const line = c => `${c.birth}  ${c.a.league} ${c.a.id} ${c.a.name}  <->  ${c.b.league} ${c.b.id} ${c.b.name}  (${c.a.origin})`;
  console.log(`Known duplicates still on two rosters: ${duplicates.length}`);
  duplicates.forEach(c => console.log('  ' + line(c)));
  console.log(`Unreviewed candidates: ${unreviewed.length}`);
  unreviewed.forEach(c => console.log('  ' + line(c)));
  if (unreviewed.length) {
    console.log('\nCheck each one (same person?) and add it to data_pipeline/cross_league_reviewed.json.');
    process.exitCode = 1;
  }
}
