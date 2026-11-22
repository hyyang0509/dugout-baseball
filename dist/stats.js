// DUGOUT stat lines: derived batting and pitching numbers, shared by tables and player cards.
// Simulated season stats include the postseason (team records count the regular season only).
import {defenseAt, primaryPosition, hasBat} from './engine.js?v=32';

export const ip = outs => `${Math.floor((outs || 0) / 3)}.${(outs || 0) % 3}`;
const rate = (n, d, digits = 3) => d ? (n / d).toFixed(digits).replace(/^0\./, '.') : '—';
const per9 = (n, outs) => outs ? (n * 27 / outs).toFixed(2) : '—';

/** Batting line with derived rates. Missing fields (older saves) count as zero. */
export function batLine(b = {}) {
  const ab = b.ab || 0, h = b.h || 0, d = b.d || 0, t = b.t || 0, hr = b.hr || 0, bb = b.bb || 0, sf = b.sf || 0;
  const tb = h + d + 2 * t + 3 * hr, obpD = ab + bb + sf;
  const avg = ab ? h / ab : 0, obp = obpD ? (h + bb) / obpD : 0, slg = ab ? tb / ab : 0;
  return {g: b.g || 0, pa: b.pa || 0, ab, r: b.r || 0, h, d, t, hr, rbi: b.rbi || 0, bb, k: b.k || 0, tb, avg, obp, slg, ops: obp + slg};
}
/** Pitching line with derived rates. */
export function pitchLine(p = {}) {
  const outs = p.outs || 0, er = p.er ?? p.r ?? 0, inn = outs / 3;
  return {g: p.g || 0, gs: p.gs || 0, w: p.w || 0, l: p.l || 0, sv: p.sv || 0, hld: p.hld || 0, bs: p.bs || 0, qs: p.qs || 0,
    outs, h: p.h || 0, r: p.r || 0, er, hr: p.hr || 0, bb: p.bb || 0, k: p.k || 0,
    era: outs ? er * 27 / outs : null, whip: inn ? ((p.h || 0) + (p.bb || 0)) / inn : null,
    k9: outs ? (p.k || 0) * 27 / outs : null, bb9: outs ? (p.bb || 0) * 27 / outs : null};
}
/** League baselines for OPS+ and ERA+. */
export function leagueBaselines(s) {
  const b = batLine(Object.values(s.batting || {}).reduce((a, x) => { for (const k of ['ab', 'h', 'd', 't', 'hr', 'bb', 'sf']) a[k] = (a[k] || 0) + (x[k] || 0); return a; }, {}));
  const p = Object.values(s.pitching || {}).reduce((a, x) => { a.er += x.er ?? x.r ?? 0; a.outs += x.outs || 0; return a; }, {er: 0, outs: 0});
  return {obp: b.obp, slg: b.slg, era: p.outs ? p.er * 27 / p.outs : null};
}
export const opsPlus = (line, base) => base.obp && base.slg && line.ab ? Math.round(100 * (line.obp / base.obp + line.slg / base.slg - 1)) : null;
export const eraPlus = (line, base) => line.era != null && base.era ? (line.era === 0 ? 999 : Math.round(100 * base.era / line.era)) : null;

// ---- WAR (wins above replacement), a simplified game estimate built from the stats the engine records.
// Batters: linear-weight batting runs (wOBA) + position adjustment + fielding runs estimated from the
// defence rating (the engine records no fielding plays) + replacement runs. Pitchers: runs allowed per
// nine against the league, plus replacement level by role. Not an official or published WAR.
const WOBA = {bb: .69, s: .88, d: 1.25, t: 1.58, hr: 2.03};
/** Position adjustment in runs per 162 games (harder positions earn more). */
export const POS_ADJ = {C: 12.5, SS: 7.5, '2B': 2.5, '3B': 2.5, CF: 2.5, LF: -7.5, RF: -7.5, '1B': -12.5, DH: -17.5};
// The weights are already scaled to on-base percentage, so runs = (wOBA − league wOBA) / WOBA_SCALE per PA.
const WOBA_SCALE = 1.2, REPLACEMENT_PER_PA = 18.5 / 600, FIELD_RUNS_PER_POINT = .6, SP_REPL = .13, RP_REPL = .035;
const wobaNum = b => WOBA.bb * (b.bb || 0) + WOBA.s * ((b.h || 0) - (b.d || 0) - (b.t || 0) - (b.hr || 0)) + WOBA.d * (b.d || 0) + WOBA.t * (b.t || 0) + WOBA.hr * (b.hr || 0);
const wobaDen = b => (b.ab || 0) + (b.bb || 0) + (b.sf || 0);
/** League context for WAR: average wOBA, its scale to runs, runs allowed per nine and runs per win. */
export function warContext(s) {
  let num = 0, den = 0, r = 0, outs = 0, rs = 0, games = 0;
  for (const b of Object.values(s.batting || {})) { num += wobaNum(b); den += wobaDen(b); }
  for (const p of Object.values(s.pitching || {})) { r += p.r || 0; outs += p.outs || 0; }
  for (const t of Object.values(s.teams || {})) { rs += t.rs || 0; games += (t.w || 0) + (t.l || 0); }
  const woba = den ? num / den : .32, rpg = games ? rs / games : 4.5;
  return {woba, scale: WOBA_SCALE, ra9: outs ? r * 27 / outs : rpg, rpw: 2 * Math.pow(2 * rpg, .715)};
}
/** Games at each position: recorded since v2.9; earlier games count at the primary position. */
function positionGames(b, p) {
  const games = {...(b.pos || {})}, known = Object.values(games).reduce((a, n) => a + n, 0), rest = Math.max(0, (b.g || 0) - known);
  if (rest) { const pos = p && hasBat(p) ? primaryPosition(p) : 'DH'; games[pos] = (games[pos] || 0) + rest; }
  return games;
}
/** Batting WAR and its parts in runs. `p` (the player) is needed for position and fielding. */
export function batWar(b, ctx, p) {
  if (!b || !b.pa) return null;
  const den = wobaDen(b), bat = den ? (wobaNum(b) / den - ctx.woba) / ctx.scale * b.pa : 0;
  let pos = 0, fld = 0;
  for (const [spot, n] of Object.entries(positionGames(b, p))) {
    pos += (POS_ADJ[spot] ?? 0) * n / 162;
    const d = p && spot !== 'DH' ? defenseAt(p, spot) : null;
    if (d != null) fld += (d - 50) * FIELD_RUNS_PER_POINT * n / 162;
  }
  const rep = REPLACEMENT_PER_PA * b.pa;
  return {bat, pos, fld, rep, rpw: ctx.rpw, war: (bat + pos + fld + rep) / ctx.rpw};
}
/** Pitching WAR: runs allowed per nine against the league average, plus replacement level (starters higher). */
export function pitWar(q, ctx) {
  if (!q || !q.outs) return null;
  const inn9 = q.outs / 27, runs = (ctx.ra9 - (q.r || 0) / inn9) * inn9, share = q.g ? (q.gs || 0) / q.g : 0;
  const rep = inn9 * (SP_REPL * share + RP_REPL * (1 - share)) * ctx.rpw;
  return {runs, rep, war: (runs + rep) / ctx.rpw};
}
/** A player's total WAR (batting and pitching both count for two-way players), or null before playing. */
export function playerWar(s, p, ctx = warContext(s)) {
  const b = batWar(s.batting?.[p.id], ctx, p), q = pitWar(s.pitching?.[p.id], ctx);
  return b || q ? (b?.war || 0) + (q?.war || 0) : null;
}
export const fmtWar = v => v == null ? '—' : (Math.abs(v) < .05 ? 0 : v).toFixed(1);

const fmt3 = v => v == null ? '—' : v.toFixed(3).replace(/^0\./, '.');
const fmt2 = v => v == null ? '—' : v.toFixed(2);
const int = v => v == null ? '—' : String(v);

// Columns: key, header, value (for sorting), text, sort direction (1 = lower is better), short explanation.
export const BAT_COLUMNS = [
  {key: 'g', label: 'G', get: l => l.g, text: l => int(l.g), hint: '出賽'},
  {key: 'pa', label: 'PA', get: l => l.pa, text: l => int(l.pa), hint: '打席'},
  {key: 'avg', label: 'AVG', get: l => l.ab ? l.avg : -1, text: l => l.ab ? fmt3(l.avg) : '—', hint: '打擊率'},
  {key: 'obp', label: 'OBP', get: l => l.pa ? l.obp : -1, text: l => l.pa ? fmt3(l.obp) : '—', hint: '上壘率'},
  {key: 'slg', label: 'SLG', get: l => l.ab ? l.slg : -1, text: l => l.ab ? fmt3(l.slg) : '—', hint: '長打率'},
  {key: 'ops', label: 'OPS', get: l => l.pa ? l.ops : -1, text: l => l.pa ? fmt3(l.ops) : '—', hint: '上壘率＋長打率'},
  {key: 'opsPlus', label: 'OPS+', get: l => l.opsPlus ?? -1, text: l => int(l.opsPlus), hint: '和聯盟平均比較，100 為平均'},
  {key: 'war', label: 'WAR', get: l => l.war ?? -99, text: l => fmtWar(l.war), hint: '勝場貢獻值（遊戲估算）：比替補球員多贏幾場，含打擊、守位與守備'},
  {key: 'h', label: 'H', get: l => l.h, text: l => int(l.h), hint: '安打'},
  {key: 'd', label: '2B', get: l => l.d, text: l => int(l.d), hint: '二壘安打'},
  {key: 't', label: '3B', get: l => l.t, text: l => int(l.t), hint: '三壘安打'},
  {key: 'hr', label: 'HR', get: l => l.hr, text: l => int(l.hr), hint: '全壘打'},
  {key: 'rbi', label: 'RBI', get: l => l.rbi, text: l => int(l.rbi), hint: '打點'},
  {key: 'r', label: 'R', get: l => l.r, text: l => int(l.r), hint: '得分'},
  {key: 'bb', label: 'BB', get: l => l.bb, text: l => int(l.bb), hint: '四壞球'},
  {key: 'k', label: 'K', get: l => l.k, text: l => int(l.k), dir: 1, hint: '被三振'},
];
export const PIT_COLUMNS = [
  {key: 'g', label: 'G', get: l => l.g, text: l => int(l.g), hint: '出賽'},
  {key: 'gs', label: 'GS', get: l => l.gs, text: l => int(l.gs), hint: '先發'},
  {key: 'w', label: 'W', get: l => l.w, text: l => int(l.w), hint: '勝投'},
  {key: 'l', label: 'L', get: l => l.l, text: l => int(l.l), dir: 1, hint: '敗投'},
  {key: 'sv', label: 'SV', get: l => l.sv, text: l => int(l.sv), hint: '救援成功'},
  {key: 'hld', label: 'HLD', get: l => l.hld, text: l => int(l.hld), hint: '中繼成功'},
  {key: 'bs', label: 'BS', get: l => l.bs, text: l => int(l.bs), dir: 1, hint: '救援失敗'},
  {key: 'outs', label: 'IP', get: l => l.outs, text: l => ip(l.outs), hint: '投球局數'},
  {key: 'era', label: 'ERA', get: l => l.era ?? 99, text: l => fmt2(l.era), dir: 1, hint: '防禦率（每九局自責分）'},
  {key: 'eraPlus', label: 'ERA+', get: l => l.eraPlus ?? -1, text: l => int(l.eraPlus), hint: '和聯盟平均比較，100 為平均'},
  {key: 'war', label: 'WAR', get: l => l.war ?? -99, text: l => fmtWar(l.war), hint: '勝場貢獻值（遊戲估算）：比替補投手多贏幾場，依失分與投球局數'},
  {key: 'whip', label: 'WHIP', get: l => l.whip ?? 99, text: l => fmt2(l.whip), dir: 1, hint: '每局被上壘（安打＋四壞）'},
  {key: 'k', label: 'K', get: l => l.k, text: l => int(l.k), hint: '三振'},
  {key: 'k9', label: 'K/9', get: l => l.k9 ?? -1, text: l => fmt2(l.k9), hint: '每九局三振'},
  {key: 'bb9', label: 'BB/9', get: l => l.bb9 ?? 99, text: l => fmt2(l.bb9), dir: 1, hint: '每九局四壞'},
  {key: 'hr', label: 'HR', get: l => l.hr, text: l => int(l.hr), dir: 1, hint: '被全壘打'},
  {key: 'qs', label: 'QS', get: l => l.qs, text: l => int(l.qs), hint: '優質先發（6 局以上、自責分 3 分以下）'},
];

/** Rows for a stat table, sorted by a column. Rate stats below the qualifier sink to the bottom. */
export function statRows(s, ids, kind, sortKey, qualifier = 0, playerOf = null) {
  const base = leagueBaselines(s), ctx = warContext(s), cols = kind === 'pit' ? PIT_COLUMNS : BAT_COLUMNS;
  const col = cols.find(c => c.key === sortKey) || cols[0], rateStat = ['avg', 'obp', 'slg', 'ops', 'opsPlus', 'era', 'eraPlus', 'whip', 'k9', 'bb9'].includes(col.key);
  const rows = ids.map(id => {
    const line = kind === 'pit' ? pitchLine(s.pitching[id]) : batLine(s.batting[id]);
    if (kind === 'pit') { line.eraPlus = eraPlus(line, base); line.war = pitWar(s.pitching[id], ctx)?.war ?? null; }
    else { line.opsPlus = opsPlus(line, base); line.war = batWar(s.batting[id], ctx, playerOf?.(id))?.war ?? null; }
    const volume = kind === 'pit' ? line.outs : line.pa;
    return {id, line, qualified: volume >= qualifier && volume > 0};
  });
  const dir = col.dir || -1;
  return rows.sort((a, b) => (rateStat ? (b.qualified - a.qualified) : 0) || -dir * (col.get(b.line) - col.get(a.line)) || String(a.id).localeCompare(String(b.id)));
}
