// World mode: MLB, NPB and CPBL run side by side in one save, on one rating scale.
// Each league keeps its own season state (schedule, standings, playoffs); the user
// manages one club and the other two leagues are fully simulated by the AI.
import {makeSeason, nextDay, advanceSeason, seasonData, migrateSeason, standings, overall, hasBat, hasPitch, teamOf, addNews, clamp, VERSION} from './engine.js?v=14';

export const WORLD_VERSION = 1;
export const WORLD_KEY = 'dugout.world.v1';
export const LEAGUE_ORDER = ['MLB', 'NPB', 'CPBL'];
export const LEAGUE_NAME = {MLB: '美國職棒', NPB: '日本職棒', CPBL: '中華職棒'};
export const LEAGUE_SHORT = {MLB: '美職', NPB: '日職', CPBL: '中職'};

// Realistic strength gap: every league's source ratings are centred near 49 within
// that league. On the shared world scale NPB sits roughly a level below MLB and
// CPBL another level below NPB, with a slightly narrower spread.
export const LEAGUE_SCALE = {
  MLB: {shift: 0, spread: 1},
  NPB: {shift: -8, spread: 0.92},
  CPBL: {shift: -15, spread: 0.85},
};
const SKILL_KEYS = ['contact', 'power', 'eye', 'stuff', 'control', 'movement'];
const ATHLETIC_KEYS = ['speed', 'defense'];

export function worldRating(league, key, value) {
  const k = LEAGUE_SCALE[league] || LEAGUE_SCALE.MLB;
  if (SKILL_KEYS.includes(key)) return clamp(Math.round(49 + (value - 49) * k.spread + k.shift), 20, 80);
  if (ATHLETIC_KEYS.includes(key)) return clamp(Math.round(value + k.shift / 2), 20, 80);
  return value; // stamina describes role and workload, not league quality
}

/** Converts one league's roster file to the world scale (pure; returns a new object). */
export function toWorldScale(league, data) {
  return {
    ...data,
    league,
    teams: data.teams.map(t => ({...t, league})),
    players: data.players.map(p => ({
      ...p,
      league,
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
    leagues[id] = s;
  });
  return {kind: 'world', worldVersion: WORLD_VERSION, userLeague, teamId, year: leagues[userLeague].year, leagues, digest: [], createdAt: new Date().toISOString()};
}

export function worldDatas(w, bases) {
  return Object.fromEntries(LEAGUE_ORDER.map(id => [id, seasonData(bases[id], w.leagues[id])]));
}

// AI leagues keep a short memory so the save stays well inside browser storage limits.
function trimAI(s) {
  s.history = s.history.slice(0, 30);
  if (Array.isArray(s.news)) s.news = s.news.slice(0, 60);
  s.lastGame = null;
  s.eventLog = (s.eventLog || []).slice(0, 10);
}

function digestAI(w, id, before, s, datas) {
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

/** Rolls the whole world into the next year. Works on a clone; the input stays intact. */
export function advanceWorld(previous, bases) {
  const w = structuredClone(previous);
  if (userSeason(w).phase !== 'finished') throw new Error('請先完成本季冠軍賽，再進入下一季。');
  finishWorld(w, worldDatas(w, bases));
  const leagues = {};
  for (const id of LEAGUE_ORDER) {
    const next = advanceSeason(w.leagues[id], bases[id]);
    if (id !== w.userLeague) { next.aiOnly = true; trimAI(next); }
    leagues[id] = next;
  }
  const out = {...w, leagues, year: leagues[w.userLeague].year};
  for (const id of LEAGUE_ORDER) if (id !== w.userLeague) {
    const c = w.digest.find(d => d.league === id && d.year === w.year);
    if (c) addNews(leagues[w.userLeague], {category: 'world', teamIds: [], title: `${LEAGUE_NAME[id]}上季冠軍：${bases[id].teams.find(t => t.id === c.champion)?.zh || ''}`, text: `${out.year} 年${LEAGUE_NAME[id]}開季，衛冕軍是 ${bases[id].teams.find(t => t.id === c.champion)?.zh || ''}。`});
  }
  return out;
}

/** Validates and migrates a parsed save. Throws with a readable message when unusable. */
export function restoreWorld(parsed, bases) {
  if (parsed?.kind !== 'world' || parsed.worldVersion !== WORLD_VERSION || !LEAGUE_ORDER.includes(parsed.userLeague)) throw new Error('存檔格式不符');
  for (const id of LEAGUE_ORDER) {
    const s = parsed.leagues?.[id];
    if (!s || !Array.isArray(s.schedule) || !s.teams || !s.condition || !['regular', 'playoffs', 'finished'].includes(s.phase)) throw new Error('存檔格式不符');
    for (const t of bases[id].teams) if (!s.teams[t.id]) throw new Error('球隊名單格式不符');
    migrateSeason(s, seasonData(bases[id], s));
    if (id !== parsed.userLeague) s.aiOnly = true;
  }
  if (!parsed.leagues[parsed.userLeague].teams[parsed.teamId]) throw new Error('存檔格式不符');
  parsed.digest ??= [];
  return parsed;
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
      rows.push({id: p.id, name: p.name, league: id, teamId, team: data.teams.find(t => t.id === teamId)?.zh || '', position: p.position, ovr: Math.round(overall(p))});
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
