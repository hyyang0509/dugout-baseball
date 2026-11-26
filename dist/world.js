// World mode: MLB, NPB, KBO and CPBL run side by side in one save, on one rating scale.
// Each league keeps its own season state (schedule, standings, playoffs); the user
// manages one club and the other two leagues are fully simulated by the AI.
import {makeSeason, nextDay, seasonData, migrateSeason, standings, overall, ovr, primaryPosition, hasBat, hasPitch, teamOf, addNews, VERSION, LEAGUE_SCALE, worldRating, salaryOf} from './engine.js?v=41';

export const WORLD_VERSION = 1;
export const WORLD_KEY = 'dugout.world.v1';
export const LEAGUE_ORDER = ['MLB', 'NPB', 'KBO', 'CPBL'];
export const LEAGUE_NAME = {MLB: '美國職棒', NPB: '日本職棒', KBO: '韓國職棒', CPBL: '中華職棒'};
export const LEAGUE_SHORT = {MLB: '美職', NPB: '日職', KBO: '韓職', CPBL: '中職'};

// Realistic strength gap (LEAGUE_SCALE lives in the engine): NPB sits roughly a level
// below MLB and CPBL another level below NPB, with a slightly narrower spread.
export {LEAGUE_SCALE, worldRating};

// Where a player comes from decides who counts as a foreign player (洋將) and which
// league feels like home in free agency. JPN -> NPB, TWN -> CPBL, everyone else -> MLB.
const MLB_JPN = new Set(['Shohei Ohtani', 'Yoshinobu Yamamoto', 'Kodai Senga', 'Masataka Yoshida', 'Yusei Kikuchi', 'Roki Sasaki', 'Kazuma Okamoto', 'Munetaka Murakami', 'Tatsuya Imai', 'Yu Darvish', 'Shota Imanaga', 'Seiya Suzuki']);
const MLB_TWN = new Set(['Tsung-Che Cheng', 'Hao-Yu Lee']);
const MLB_KOR = new Set(['Ha-Seong Kim', 'Jung Hoo Lee', 'Hyeseong Kim', 'Sung-Mun Song', 'Ji Hwan Bae', 'Woo-Suk Go']);
const CPBL_JPN = new Set(['京山將彌', '大瀧幸治', '髙塩將樹', '鈴木駿輔', '榊原元稀', '永田颯太郎']);
const CPBL_INTL = new Set(['勝騎士', '布雷克', '德保拉', '銳力獅', '鋼龍', '後勁', '魔力藍', '威能帝', '魔鷹', '魔神龍', '菲力士', '坎南', '獅帝芬', '威戈神', '魔爾曼', '瑪帝斯', '道威聖', '威克', '杰克', '悍里歐', '泰威', '威鳳山']);
export const HOME_LEAGUE = {JPN: 'NPB', KOR: 'KBO', TWN: 'CPBL', INTL: 'MLB'};
export function originOf(league, p) {
  if (p.origin) return p.origin;
  if (league === 'NPB') return /[\u30a0-\u30ff]/.test(p.source_name || '') ? 'INTL' : 'JPN';
  if (league === 'KBO') return 'KOR';
  if (league === 'CPBL') return CPBL_JPN.has(p.name) ? 'JPN' : CPBL_INTL.has(p.name) ? 'INTL' : 'TWN';
  return MLB_JPN.has(p.name) ? 'JPN' : MLB_TWN.has(p.name) ? 'TWN' : MLB_KOR.has(p.name) ? 'KOR' : 'INTL';
}
export const isForeign = (p, league) => league !== 'MLB' && HOME_LEAGUE[p.origin || 'INTL'] !== league;

/** Converts one league's roster file to the world scale (pure; returns a new object). */
export function toWorldScale(league, data) {
  return {
    ...data,
    league,
    world: true,
    teams: data.teams.map(t => ({...t, league})),
    players: data.players.map(p => ({
      ...p,
      league,
      origin: originOf(league, p),
      ratings: Object.fromEntries(Object.entries(p.ratings).map(([key, v]) => [key, worldRating(league, key, v)])),
    })),
  };
}

export const userSeason = w => w.leagues[w.userLeague];
export const leagueOfTeam = (w, teamId) => LEAGUE_ORDER.find(id => w.leagues[id]?.teams?.[teamId]);

/** Creates a fresh world. `bases` maps league id to world-scaled roster data. */
export function makeWorld(bases, userLeague, teamId, seed = Date.now()) {
  if (!bases[userLeague]?.teams.some(t => t.id === teamId)) throw new Error('找不到這支球隊。');
  const leagues = {};
  LEAGUE_ORDER.forEach((id, i) => {
    const s = makeSeason(bases[id], id === userLeague ? teamId : null, ((seed >>> 0) + i * 7919) >>> 0);
    if (id !== userLeague) s.aiOnly = true;
    ensureContracts(s, bases[id]);
    leagues[id] = s;
  });
  return {kind: 'world', worldVersion: WORLD_VERSION, userLeague, teamId, year: leagues[userLeague].year, leagues, digest: [], createdAt: new Date().toISOString()};
}

// Contracts: years left including the current season (1 = expires after this season).
function idHash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
export function initialContractYears(p, year) {
  const age = year - Number(p.birth_date?.slice(0, 4) || 1998), r = idHash(p.id + ':' + year);
  const span = age <= 24 ? 3 : age <= 30 ? 5 : age <= 33 ? 3 : 2;
  return 1 + Math.floor(r * span);
}
export function ensureContracts(s, data) {
  s.contracts ??= {};
  for (const p of data.players) s.contracts[p.id] ??= initialContractYears(p, s.year || 2026);
  // Salaries are locked for the length of a deal; older saves lock today's price on load.
  s.salaries ??= {};
  for (const p of data.players) s.salaries[p.id] ??= salaryOf(p);
  return s.contracts;
}

export function worldDatas(w, bases) {
  return Object.fromEntries(LEAGUE_ORDER.map(id => [id, seasonData(bases[id], w.leagues[id])]));
}

// AI leagues keep a short memory so the save stays well inside browser storage limits.
export function trimAI(s) {
  s.history = s.history.slice(0, 30);
  if (Array.isArray(s.news)) s.news = s.news.slice(0, 60);
  s.lastGame = null;
  s.eventLog = (s.eventLog || []).slice(0, 10);
  // The yearly change report is only ever shown for the user's own league.
  s.offseason = null;
}

// Save compaction. Pool players carry source metadata that never changes in play; a
// packed save drops those fields when they still match the original snapshot and
// restoreWorld fills them back. Ratings, age and everything else stay in the save.
const STATIC_KEYS = ['source_url', 'source_name', 'roster_source', 'positions_source', 'ratings_source', 'name_transliterated', 'throws', 'bats', 'jersey_number', 'source_id', 'positions_note', 'position_evidence'];
const same = (a, b) => a === b || (typeof a === 'object' && a !== null && JSON.stringify(a) === JSON.stringify(b));
const baseIndex = bases => new Map(Object.values(bases).flatMap(d => d?.players || []).map(p => [p.id, p]));
export function packWorld(w, bases) {
  const index = baseIndex(bases), leagues = {};
  for (const [id, s] of Object.entries(w.leagues)) {
    leagues[id] = !s.playerPool ? s : {...s, playerPool: s.playerPool.map(p => {
      const b = index.get(p.id); if (!b) return p;
      const q = {...p}; for (const k of STATIC_KEYS) if (k in q && same(q[k], b[k])) delete q[k];
      return q;
    })};
  }
  return JSON.stringify({...w, leagues});
}
function unpackPools(parsed, bases) {
  const index = baseIndex(bases);
  for (const s of Object.values(parsed.leagues || {})) for (const p of s?.playerPool || []) {
    const b = index.get(p.id); if (!b) continue;
    for (const k of STATIC_KEYS) if (!(k in p) && k in b) p[k] = structuredClone(b[k]);
  }
}

export function digestAI(w, id, before, s, datas) {
  const name = tid => datas[id].teams.find(t => t.id === tid)?.zh || tid;
  const user = userSeason(w);
  if (before.phase === 'regular' && s.phase === 'playoffs') {
    const seeds = s.playoffs?.seeds || [];
    addNews(user, {category: 'world', teamIds: [], title: `${LEAGUE_NAME[id]}例行賽結束`, text: `季後賽隊伍：${seeds.map(name).join('、')}。`});
  }
  if (before.phase !== 'finished' && s.phase === 'finished' && s.champion) {
    addNews(user, {category: 'world', teamIds: [], title: `${LEAGUE_NAME[id]}總冠軍：${name(s.champion)}`, text: `${name(s.champion)} 在 ${w.year} 年拿下${LEAGUE_NAME[id]}總冠軍。`});
    w.digest.unshift({year: w.year, league: id, champion: s.champion});
  }
}

/**
 * Advances every unfinished league by one day. Returns the user's league results.
 * The user's league stops for clubhouse events exactly as before; AI leagues never do.
 */
export function worldNextDay(w, datas, options = {}) {
  const user = userSeason(w);
  if (user.event) return [];
  const userWasLive = user.phase !== 'finished';
  const results = userWasLive ? nextDay(user, datas[w.userLeague], options) : [];
  for (const id of LEAGUE_ORDER) {
    if (id === w.userLeague) continue;
    const s = w.leagues[id];
    if (s.phase === 'finished') continue;
    // Keep AI leagues on the same calendar as the user's league.
    if (userWasLive && s.day >= user.day) continue;
    const before = {phase: s.phase};
    nextDay(s, datas[id], {});
    s.event = null;
    trimAI(s);
    digestAI(w, id, before, s, datas);
  }
  if (userWasLive && user.phase === 'regular' && user.day > 0 && user.day % 7 === 0) weeklyDigest(w, datas);
  if (userWasLive) progressScouting(w);
  return results;
}

// A weekly look at the other two leagues, so the rest of the world stays visible.
function weeklyDigest(w, datas) {
  const user = userSeason(w);
  const parts = LEAGUE_ORDER.filter(id => id !== w.userLeague).map(id => {
    const table = standings(w.leagues[id]), [leadId, lead] = table[0] || [];
    if (!leadId) return '';
    const name = datas[id].teams.find(t => t.id === leadId)?.zh || leadId;
    return `${LEAGUE_NAME[id]}由${name}（${lead.w} 勝 ${lead.l} 敗）領先`;
  }).filter(Boolean);
  if (parts.length) addNews(user, {category: 'world', teamIds: [], title: `世界棒球週報 · 第 ${user.day} 日`, text: parts.join('；') + '。'});
}

export const worldFinished = w => LEAGUE_ORDER.every(id => w.leagues[id].phase === 'finished');

/** Simulates whatever is left of the AI leagues (used before rolling over to a new year). */
export function finishWorld(w, datas, maxDays = 400) {
  for (let i = 0; i < maxDays && !worldFinished(w); i++) {
    for (const id of LEAGUE_ORDER) {
      const s = w.leagues[id];
      if (s.phase === 'finished') continue;
      const before = {phase: s.phase};
      if (id === w.userLeague) { if (s.event) s.event = null; nextDay(s, datas[id], {}); continue; }
      nextDay(s, datas[id], {}); s.event = null; trimAI(s); digestAI(w, id, before, s, datas);
    }
  }
  if (!worldFinished(w)) throw new Error('其他聯盟的球季未能完成。');
  return w;
}

/**
 * Leagues in a parsed save that were started from an older roster snapshot and have not
 * stored their own player pool yet (first season). Returns [{id, dataVersion}].
 */
export function legacyRosterNeeds(parsed, bases) {
  return LEAGUE_ORDER.filter(id => {
    const s = parsed?.leagues?.[id];
    return s && !s.playerPool && bases[id] && s.dataVersion && s.dataVersion !== bases[id].generated_at;
  }).map(id => ({id, dataVersion: parsed.leagues[id].dataVersion}));
}
/** Freezes that league's save on the roster it started with (a world-scaled copy). */
export function attachLegacyPool(parsed, id, scaledData) {
  parsed.leagues[id].playerPool = structuredClone(scaledData.players);
}

/** Validates and migrates a parsed save. Throws with a readable message when unusable. */
export function restoreWorld(parsed, bases) {
  if (parsed?.kind !== 'world' || parsed.worldVersion !== WORLD_VERSION || !LEAGUE_ORDER.includes(parsed.userLeague)) throw new Error('存檔格式不符');
  // v2.0 added KBO: older saves get a KBO season that catches up with the user's league.
  for (const id of LEAGUE_ORDER) if (!parsed.leagues?.[id] && bases[id]) addLeague(parsed, bases, id);
  unpackPools(parsed, bases);
  for (const id of LEAGUE_ORDER) {
    const s = parsed.leagues?.[id];
    if (!s || !Array.isArray(s.schedule) || !s.teams || !s.condition || !['regular', 'playoffs', 'finished'].includes(s.phase)) throw new Error('存檔格式不符');
    for (const t of bases[id].teams) if (!s.teams[t.id]) throw new Error('球隊名單格式不符');
    for (const p of s.playerPool || []) { p.league ??= id; p.origin ??= originOf(id, p); }
    s.world = true;
    migrateSeason(s, seasonData(bases[id], s));
    ensureContracts(s, seasonData(bases[id], s));
    if (id !== parsed.userLeague) s.aiOnly = true;
  }
  if (!parsed.leagues[parsed.userLeague].teams[parsed.teamId]) throw new Error('存檔格式不符');
  parsed.digest ??= [];
  scouting(parsed);
  return parsed;
}

function addLeague(w, bases, id) {
  const user = w.leagues[w.userLeague], s = makeSeason(bases[id], null, (idHash(id + w.createdAt) * 4294967296) >>> 0);
  s.aiOnly = true; s.year = w.year || user.year; ensureContracts(s, bases[id]); w.leagues[id] = s;
  const data = bases[id], target = user.phase === 'finished' || w.offseason ? Infinity : user.day;
  for (let i = 0; i < 400 && s.phase !== 'finished' && s.day < target; i++) { nextDay(s, data, {}); s.event = null; trimAI(s); }
}

/** League standings for any league (read-only views). */
export function leagueTable(w, id) {
  return standings(w.leagues[id]);
}

/** Best players in the whole world on the shared scale. */
export function worldTop(w, datas, {limit = 20, kind = 'all'} = {}) {
  const rows = [];
  for (const id of LEAGUE_ORDER) {
    const s = w.leagues[id], data = datas[id];
    for (const p of data.players) {
      if (kind === 'bat' && !hasBat(p)) continue;
      if (kind === 'pitch' && !hasPitch(p)) continue;
      const teamId = teamOf(s, p);
      if (!teamId) continue;
      rows.push({id: p.id, name: p.name, league: id, teamId, team: data.teams.find(t => t.id === teamId)?.zh || '', position: hasBat(p) ? primaryPosition(p) : (p.role || 'P'), ovr: ovr(p)});
    }
  }
  return rows.sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Average overall of each league's regulars, to show the strength gap. */
export function leagueStrength(w, datas) {
  return Object.fromEntries(LEAGUE_ORDER.map(id => {
    const s = w.leagues[id], data = datas[id];
    const vals = data.teams.flatMap(t => data.players.filter(p => teamOf(s, p) === t.id).map(p => overall(p)).sort((a, b) => b - a).slice(0, 14));
    return [id, Math.round(vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length))];
  }));
}

export {VERSION};

// ---------------------------------------------------------------- Scouting
// Players outside your own league are seen through estimates until a scout files a
// report. Reports take a few game days during the season (instant in the offseason)
// and stay valid for the current and the following season.
export const SCOUT_DAYS = 5, SCOUT_SLOTS = 3, SCOUT_BASE_COST = 40000;
const SCOUT_PAY = {MLB: 1, NPB: 0.3, KBO: 0.15, CPBL: 0.08};

export function scouting(w) {
  w.scouting ??= {known: {}, queue: []};
  return w.scouting;
}
export const scoutCost = w => Math.max(3000, Math.round(SCOUT_BASE_COST * (SCOUT_PAY[w.userLeague] ?? 1) / 1000) * 1000);
export function isKnown(w, p, league) {
  if (!w || league === w.userLeague) return true;
  const year = scouting(w).known[p.id];
  return year != null && year >= w.year - 1;
}
export const scoutingDaysLeft = (w, id) => scouting(w).queue.find(q => q.id === id)?.days ?? null;

function fuzz(id, key) {
  let h = 2166136261;
  for (const ch of String(id) + '|' + key) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 9) - 4; // -4..+4, fixed per player and rating
}
/** A rating as the user sees it: exact if known, otherwise an 8-point range around a biased guess. */
export function ratingView(w, p, league, key) {
  const v = p.ratings[key];
  if (v == null || isKnown(w, p, league)) return {known: true, value: v};
  const c = v + fuzz(p.id, key);
  return {known: false, low: Math.max(20, c - 4), high: Math.min(80, c + 4)};
}
export function ovrView(w, p, league) {
  const v = ovr(p);
  if (isKnown(w, p, league)) return {known: true, value: v};
  return {known: false, value: Math.round((v + fuzz(p.id, 'ovr')) / 5) * 5};
}

/** Sends a scout. Returns {ok, reason}. Charges the user's club immediately. */
export function startScouting(w, p, league) {
  const sc = scouting(w), user = userSeason(w), f = user.finance[w.teamId], cost = scoutCost(w);
  if (league === w.userLeague) return {ok: false, reason: '同聯盟的球員不需要派球探。'};
  if (isKnown(w, p, league)) return {ok: false, reason: '已經有這名球員的球探報告。'};
  if (sc.queue.some(q => q.id === p.id)) return {ok: false, reason: '球探已經在觀察這名球員。'};
  if (sc.queue.length >= SCOUT_SLOTS) return {ok: false, reason: `最多同時派出 ${SCOUT_SLOTS} 名球探。`};
  if (f.cash < cost) return {ok: false, reason: '球團現金不足。'};
  f.cash -= cost; f.operatingCost = (f.operatingCost || 0) + cost;
  f.ledger?.unshift({day: user.day, type: 'scouting', label: `球探出差：${p.name}`, income: 0, salary: 0, cost, attendance: 0, net: -cost});
  const instant = user.phase === 'finished';
  if (instant) { sc.known[p.id] = w.year; addNews(user, {category: 'team', teamIds: [w.teamId], title: `球探報告：${p.name}`, text: `${LEAGUE_NAME[league]}的 ${p.name} 能力已確認。`}); }
  else sc.queue.push({id: p.id, name: p.name, league, days: SCOUT_DAYS});
  return {ok: true, instant};
}

function progressScouting(w) {
  const sc = scouting(w), user = userSeason(w);
  for (const q of sc.queue) q.days--;
  for (const q of sc.queue.filter(q => q.days <= 0)) {
    sc.known[q.id] = w.year;
    addNews(user, {category: 'team', teamIds: [w.teamId], title: `球探報告：${q.name}`, text: `${LEAGUE_NAME[q.league]}的 ${q.name} 能力已確認，可在球員資料查看。`});
  }
  sc.queue = sc.queue.filter(q => q.days > 0);
}
