// GM career (v3.6). A world is one GM's career: the world save holds w.gm ({name, createdAt,
// retired}) and the season records come from the user season's GM history (front.js), so
// there is nothing extra to store. Reputation, totals, earnings, the team timeline and
// achievements are all derived from those records. Pure functions only.
//
// v3.5 kept careers in a separate store (dugout.gm.v1). v3.6 no longer writes it; the app
// only reads it once to offer keepsake images of GMs whose worlds were replaced.
export const CAREER_KEY = 'dugout.gm.v1';
export const CAREER_KIND = 'bm27-gm-career';
export const NAME_MAX = 12;
export const START_REPUTATION = 20;

const LEAGUE_ORDER = ['MLB', 'NPB', 'KBO', 'CPBL'];
export const LEAGUE_SHORT = {MLB: '美職', NPB: '日職', KBO: '韓職', CPBL: '中職'};
// Game-only GM salaries (game US$), by league; a club's budget picks a point in the range.
export const SALARY_RANGE = {MLB: [1e6, 4e6], NPB: [4e5, 1.5e6], KBO: [2.5e5, 8e5], CPBL: [1.2e5, 4e5]};
const LEAGUE_WEIGHT = {MLB: 1.15, NPB: 1, KBO: .9, CPBL: .85};
const DIFFICULTY_WEIGHT = {easy: .8, normal: 1, hard: 1.25, hell: 1.5};
const TITLE_REP = {champion: 2, genius: 2, tyrant: -2, gambler: -2};
export const DIFFICULTY_LABEL = {easy: '輕鬆', normal: '標準', hard: '困難', hell: '地獄'};

/** Validates a v3.5 career profile (read-only legacy data; throws a readable error). */
export function normalizeProfile(p) {
  if (!p || p.kind !== CAREER_KIND || !Array.isArray(p.gms)) throw new Error('不是 BM27 GM 生涯檔');
  for (const g of p.gms) {
    if (!g || typeof g.id !== 'string' || typeof g.name !== 'string' || !Array.isArray(g.seasons)) throw new Error('GM 生涯檔格式不符');
  }
  p.version ??= 1;
  return p;
}

export function cleanName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}
/** Adds a GM. A name already in use gets a number: 阿明 → 阿明 (2). */
/** A world's stable id (older worlds: derived from createdAt). */
export function worldIdOf(w) {
  w.worldId ??= `w-${w.createdAt || 'legacy'}`;
  return w.worldId;
}
export const seasonKey = e => `${e.worldId}|${e.year}|${e.teamId}|${e.midseason ? 'm' : 's'}`;

/** GM salary and bonus for one season record (game dollars). */
export const salaryForBudget = (league, budgetPct) => { const [lo, hi] = SALARY_RANGE[league] || SALARY_RANGE.MLB; return Math.round((lo + (hi - lo) * Math.min(1, Math.max(0, budgetPct ?? .5))) / 1000) * 1000; };
export function payFor(e) {
  if (e.unemployed) return {salary: 0, bonus: 0, severance: 0};
  const share = e.share ?? 1, base = e.contractSalary ?? salaryForBudget(e.league, e.budgetPct);
  const salary = Math.round(base * share / 1000) * 1000;
  let rate = 0;
  if (e.playoffs) rate += .1 + .05 * (e.rounds || 0);
  if (e.champion) rate += .25;
  if (!e.midseason && (e.grade ?? 0) >= 80) rate += .1;
  // A fired GM is paid the rest of the contract (as clubs do in real baseball).
  return {salary, bonus: Math.round(salary * rate / 1000) * 1000, severance: e.fired ? e.owed || 0 : 0};
}

/** Turns a front.js history entry into a profile season record. */
export function seasonRecord(worldId, h, fallbackLeague) {
  const e = {worldId, year: h.year, league: h.league || fallbackLeague, teamId: h.teamId, team: h.team, w: h.w || 0, l: h.l || 0,
    playoffs: !!(h.playoffs || h.champion), rounds: h.rounds || 0, champion: !!h.champion, grade: h.grade ?? null, confidence: h.confidence ?? null,
    fired: !!h.fired, midseason: !!h.midseason, joined: !!h.joined, difficulty: h.difficulty || 'easy', titleIds: h.titleIds || [],
    budgetPct: h.budgetPct ?? .5, share: h.share ?? 1, legacy: h.league == null && !h.unemployed,
    contractSalary: h.contractSalary ?? null, owed: h.owed || 0, leftEarly: !!h.leftEarly, unemployed: !!h.unemployed};
  return {...e, ...payFor(e)};
}

/** The GM career of a world: {name, createdAt, retired, seasons} with records oldest first. */
export function careerOf(w, history = []) {
  const worldId = worldIdOf(w), list = [...history].reverse();
  return {name: w.gm?.name || '無名 GM', createdAt: w.gm?.createdAt || w.createdAt, retired: w.gm?.retired || null,
    seasons: list.map((h, i) => ({...seasonRecord(worldId, h, w.userLeague), seq: i + 1}))};
}

const ordered = gm => [...gm.seasons].sort((a, b) => (a.seq || 0) - (b.seq || 0));
const worked = gm => ordered(gm).filter(e => !e.unemployed);

/** Reputation change for one record (before mean reversion). */
export function reputationDelta(e) {
  if (e.unemployed) return 2; // a year away lets a bad reputation fade a little
  let gain = 0;
  const games = e.w + e.l;
  if (games) gain += (e.w / games - .5) * 30 * Math.min(1, games / 60);
  if (e.playoffs) gain += 2 + (e.rounds || 0);
  if (e.champion) gain += 5;
  if (e.grade != null && !e.midseason) gain += (e.grade - 60) * .05;
  for (const id of e.titleIds || []) gain += TITLE_REP[id] || 0;
  if (gain > 0) gain *= (LEAGUE_WEIGHT[e.league] ?? 1) * (DIFFICULTY_WEIGHT[e.difficulty] ?? 1);
  if (e.fired) gain -= 8;
  if (e.leftEarly) gain -= 4;
  return gain;
}
/** Reputation path: [{key, before, after}] plus the final value. */
export function reputationPath(gm) {
  let rep = START_REPUTATION; const path = [];
  for (const e of ordered(gm)) {
    const before = rep;
    rep += reputationDelta(e);
    // Drift toward 30 once per full season record (a mid-season firing is part of a season).
    if (!e.midseason) rep -= (rep - 30) * .06;
    rep = Math.max(0, Math.min(100, rep));
    path.push({key: seasonKey(e), before: Math.round(before), after: Math.round(rep)});
  }
  return {path, reputation: Math.round(rep)};
}
export const reputationOf = gm => reputationPath(gm).reputation;
export function reputationLevel(rep) {
  return rep >= 90 ? '傳奇' : rep >= 75 ? '頂尖' : rep >= 55 ? '知名' : rep >= 30 ? '普通' : '無名';
}

/** Totals for the hall of fame. Seasons count once per year (a mid-season move is one season). */
export function careerTotals(gm) {
  const s = worked(gm), years = new Set(s.map(e => `${e.worldId}|${e.year}`));
  const w = s.reduce((a, e) => a + e.w, 0), l = s.reduce((a, e) => a + e.l, 0);
  const salary = s.reduce((a, e) => a + (e.salary || 0), 0), bonus = s.reduce((a, e) => a + (e.bonus || 0), 0), severance = s.reduce((a, e) => a + (e.severance || 0), 0);
  return {seasons: years.size, w, l, pct: w + l ? w / (w + l) : null, playoffs: s.filter(e => e.playoffs).length, champions: s.filter(e => e.champion).length,
    fired: s.filter(e => e.fired).length, salary, bonus, severance, earnings: salary + bonus + severance, idle: gm.seasons.filter(e => e.unemployed).length, reputation: reputationOf(gm), leagues: [...new Set(s.map(e => e.league))]};
}

/** Team timeline: consecutive records with the same club in the same world merge into one stint. */
export function stints(gm) {
  const out = [];
  for (const e of worked(gm)) {
    const last = out.at(-1);
    if (last && last.worldId === e.worldId && last.teamId === e.teamId && !last.ended && e.year === last.to + 1) {
      last.to = e.year; last.w += e.w; last.l += e.l; last.champions += e.champion ? 1 : 0;
    } else out.push({worldId: e.worldId, league: e.league, teamId: e.teamId, team: e.team, from: e.year, to: e.year, w: e.w, l: e.l, champions: e.champion ? 1 : 0, joined: e.joined});
    const cur = out.at(-1);
    if (e.fired) { cur.ended = e.midseason ? '季中解職' : '解職'; }
    else if (e.leftEarly) cur.ended = '跳槽';
  }
  // A stint that is followed by a different club in the same world without a firing was left.
  for (let i = 0; i < out.length - 1; i++) if (!out[i].ended && out[i].worldId === out[i + 1].worldId) out[i].ended = '離開';
  for (let i = 0; i < out.length - 1; i++) if (!out[i].ended && out[i].worldId !== out[i + 1].worldId) out[i].ended = '重新開始';
  return out;
}

export const ACHIEVEMENTS = [
  {id: 'firstWin', label: '首勝', desc: '第一個有勝場的球季。'},
  {id: 'firstPlayoffs', label: '季後賽初登場', desc: '第一次帶隊打進季後賽。'},
  {id: 'firstTitle', label: '首冠', desc: '第一座總冠軍。'},
  {id: 'twoPeat', label: '連霸', desc: '同一個世界連續兩年奪冠。'},
  {id: 'threePeat', label: '三連霸', desc: '同一個世界連續三年奪冠。'},
  {id: 'hundredWins', label: '百勝 GM', desc: '生涯例行賽累積 100 勝。'},
  {id: 'tenYears', label: '十年老店', desc: '同一支球隊執掌 10 季。'},
  {id: 'firefighter', label: '救火隊', desc: '季中接任後，同年打進季後賽。'},
  {id: 'comeback', label: '浪子回頭', desc: '被解職後 3 季內奪冠。'},
  {id: 'overseas', label: '跨海挑戰', desc: '在兩個以上的聯盟擔任 GM。'},
  {id: 'twoLeagues', label: '雙聯盟冠軍', desc: '在兩個聯盟都拿過總冠軍。'},
  {id: 'allLeagues', label: '四聯盟制霸', desc: '美職、日職、韓職、中職都拿過總冠軍。'},
  {id: 'hellSurvivor', label: '地獄生還', desc: '地獄難度打完整季沒有被解職。'},
  {id: 'hellChampion', label: '地獄冠軍', desc: '地獄難度拿下總冠軍。'},
];
/** Unlocked achievements, each with the first year it happened. */
export function achievements(gm) {
  const got = new Map(), give = (id, e) => { if (!got.has(id)) got.set(id, {id, year: e.year, label: ACHIEVEMENTS.find(a => a.id === id).label}); };
  let wins = 0; const titleLeagues = new Set(), leagues = new Set(), streak = {}, tenure = {};
  let lastFired = null, seasonsSinceFired = 0;
  const list = worked(gm);
  for (const e of list) {
    if (e.w > 0) give('firstWin', e);
    if (e.playoffs) give('firstPlayoffs', e);
    if (e.champion) give('firstTitle', e);
    wins += e.w; if (wins >= 100) give('hundredWins', e);
    leagues.add(e.league); if (leagues.size >= 2) give('overseas', e);
    if (e.champion) { titleLeagues.add(e.league); if (titleLeagues.size >= 2) give('twoLeagues', e); if (LEAGUE_ORDER.every(x => titleLeagues.has(x))) give('allLeagues', e); }
    const k = e.worldId;
    if (e.champion) { const prev = streak[k]; streak[k] = prev && prev.year === e.year - 1 ? {year: e.year, n: prev.n + 1} : {year: e.year, n: 1}; if (streak[k].n >= 2) give('twoPeat', e); if (streak[k].n >= 3) give('threePeat', e); }
    const tk = `${e.worldId}|${e.teamId}`; if (!e.midseason) { tenure[tk] = (tenure[tk] || 0) + 1; if (tenure[tk] >= 10) give('tenYears', e); }
    if (e.joined && e.playoffs) give('firefighter', e);
    if (lastFired && e.champion && seasonsSinceFired <= 3) give('comeback', e);
    if (e.fired) { lastFired = e; seasonsSinceFired = 0; } else if (lastFired && !e.midseason) seasonsSinceFired++;
    if (e.difficulty === 'hell' && !e.fired && !e.joined && !e.midseason && !e.legacy) give('hellSurvivor', e);
    if (e.difficulty === 'hell' && e.champion) give('hellChampion', e);
  }
  return [...got.values()];
}

export function formatMoney(n) {
  return n >= 1e6 ? `US$${(n / 1e6).toFixed(2)}M` : `US$${Math.round(n / 1000).toLocaleString('en-US')}K`;
}
