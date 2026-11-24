// DUGOUT GM layer: the field manager, board goals and job security, GM reputation titles, and fan / pundit buzz.
// It hooks into the engine (HOOKS) so a season keeps running even if this module is not loaded (tests, AI leagues).
import {HOOKS, rosterFor, hasBat, hasPitch, ovr, potential, playerAge, payroll, teamStrategy, standings, seasonGames, idHash,
  moneyScale, clamp, addNews, homeAttendance, normOffer, tradeDeadline, salaryOf, optimizeLineup, currentPicture} from './engine.js?v=40';
import {teamReport, tradeImpact} from './gm.js?v=40';
import {seriesWinner} from './postseason.js?v=40';

const club = (data, id) => data.teams.find(t => t.id === id);
const seasonYear = s => s.year || 2026;

// ======================= Field manager =======================
export const MANAGER_STYLES = {
  balanced: {label: '平衡派', hint: '照能力排打線，先發投手約 85 球換下。', limit: 85},
  smallball: {label: '小球派', hint: '偏好速度快、安打多的打者。', limit: 85},
  slugger: {label: '重砲派', hint: '偏好長打者，先發可以投到 92 球左右。', limit: 92},
  veteran: {label: '老派', hint: '相信老將，先發投手投久一點（約 100 球）。', limit: 100},
  analytics: {label: '數據派', hint: '重視選球，牛棚用得早（先發約 75 球）。', limit: 75},
  youth: {label: '育成派', hint: '願意給 25 歲以下球員機會，適合重建。', limit: 85},
};
const STYLE_KEYS = Object.keys(MANAGER_STYLES);
const MANAGER_NAMES = {
  MLB: ['Walt Harmon', 'Gene Castellano', 'Pete Ruland', 'Marcus Doyle', 'Rico Valdez', 'Hal Brennecke', 'Curtis Lamb', 'Frank Oduya'],
  NPB: ['松浦大輔', '石井隆志', '川端修一', '小野寺昇', '岩崎和樹', '長谷部亮', '大塚雅彦', '宮下浩一'],
  KBO: ['金永勳', '李承哲', '朴載賢', '崔東旭', '鄭泰浩', '姜聖民', '趙恩錫', '尹在植'],
  CPBL: ['蔡明哲', '游振宏', '簡志遠', '施國良', '鄭宏毅', '潘建銘', '謝文彬', '江俊賢'],
};
function makeManager(s, i) {
  const h = idHash(s.teamId, `mgr|${seasonYear(s)}|${i}`), names = MANAGER_NAMES[s.league] || MANAGER_NAMES.MLB;
  const skill = 1 + (h % 5), style = STYLE_KEYS[(h >>> 5) % STYLE_KEYS.length];
  return {id: `mgr:${seasonYear(s)}:${i}:${h % 991}`, name: names[(h >>> 9) % names.length], style, skill, fee: (skill * skill * 30000 + 40000)};
}
export const managerFee = (s, m) => Math.max(10000, Math.round(m.fee * (moneyScale(s) || 1) / 10000) * 10000);
/** The club's manager (created on first use) and its effect on lineups and the starter's pitch limit. */
export function managerOf(s) {
  if (!s.manager || s.manager.teamId !== s.teamId) s.manager = {...makeManager(s, 0), teamId: s.teamId, hiredDay: s.day};
  const t = s.teams[s.teamId], st = MANAGER_STYLES[s.manager.style];
  t.starterLimit = st.limit; t.lineupBias = s.manager.style === 'balanced' ? null : s.manager.style;
  return s.manager;
}
export function managerCandidates(s) {
  const cur = managerOf(s);
  const seen = new Set([cur.name]), out = [];
  for (let i = 1; out.length < 3 && i < 40; i++) { const m = makeManager(s, i); if (!seen.has(m.name)) { seen.add(m.name); out.push(m); } }
  return out;
}
/** Firing pays half the current manager's fee as a buyout; hiring pays the new fee. */
export function hireManager(s, data, id) {
  const c = managerCandidates(s).find(m => m.id === id);
  if (!c) return {ok: false, reason: '這位人選已不在名單上。'};
  const old = managerOf(s), buyout = Math.round(managerFee(s, old) * .5 / 10000) * 10000, fee = managerFee(s, c), f = s.finance[s.teamId];
  if (f.cash < buyout + fee) return {ok: false, reason: '球團現金不足以支付解約金與簽約金。'};
  f.cash -= buyout + fee; f.operatingCost = (f.operatingCost || 0) + buyout + fee;
  f.ledger?.unshift({day: s.day, type: 'staff', label: `撤換總教練：${old.name} → ${c.name}`, income: 0, salary: 0, cost: buyout + fee, attendance: 0, net: -(buyout + fee)});
  s.manager = {...c, teamId: s.teamId, hiredDay: s.day};
  managerOf(s);
  const g = gmOf(s); g.season.managerFires++; g.career.managerFires++;
  const club_ = s.teams[s.teamId]; club_.morale = clamp((club_.morale ?? 50) - 3, 0, 100);
  addNews(s, {category: 'decision', teamIds: [s.teamId], title: `撤換總教練：${old.name} 下台`, text: `${c.name}（${MANAGER_STYLES[c.style].label}）接任總教練。解約金與簽約金共 US$${(buyout + fee).toLocaleString('en-US')}。`});
  fanReact(s, data, s.day - old.hiredDay < 30 ? 'fireFast' : 'fireManager', {old: old.name, name: c.name}, -2);
  if (!s.manualLineup) optimizeLineup(s, data, s.teamId);
  refreshTitles(s, data);
  return {ok: true, manager: s.manager, cost: buyout + fee};
}
/** GM takes the lineup card himself (manual) or hands it back to the manager. */
export function setSelfManaged(s, data, on) {
  s.manualLineup = !!on;
  if (!on) optimizeLineup(s, data, s.teamId);
}

// ======================= GM record and titles =======================
const blankCounters = () => ({trades: 0, tradeCashOut: 0, tradeCashIn: 0, tradeGain: 0, releases: 0, managerFires: 0, selfDays: 0, days: 0, vetsSold: 0, youngSold: 0, moraleSum: 0});
export function gmOf(s) {
  s.gm ??= {career: {...blankCounters(), seasons: 0, champions: 0, fired: 0}, season: {...blankCounters(), year: seasonYear(s)}, titles: [], history: []};
  if (s.gm.season.year !== seasonYear(s)) s.gm.season = {...blankCounters(), year: seasonYear(s)};
  // Saves from before v3.4 have no difficulty: they keep the old rules (easy).
  if (!DIFFICULTY[s.gm.difficulty]) s.gm.difficulty = 'easy';
  if (s.gm.season.low == null || !DIFFICULTY[s.gm.season.low]) s.gm.season.low = s.gm.difficulty;
  return s.gm;
}

// ======================= Board difficulty (v3.4) =======================
// start: confidence on a new game; fire: season-end threshold; penalty multiplies confidence
// losses; checks: share of the regular season at which the board reviews mid-season, with
// midFire the threshold for firing on the spot.
export const DIFFICULTY = {
  easy: {label: '輕鬆', start: 60, fire: 25, penalty: 1, checks: [], midFire: null, winsBonus: 0, floor: 0, extra: [], desc: '原本的規則：季末信任度低於 25 才會被解職。'},
  normal: {label: '標準', start: 55, fire: 30, penalty: 1.3, checks: [], midFire: null, winsBonus: 2, floor: .5, extra: [], desc: '起始信任度 55，季末低於 30 解職，扣分 ×1.3。'},
  hard: {label: '困難', start: 45, fire: 32, penalty: 1.6, checks: [.5], midFire: 20, winsBonus: 4, floor: .6, extra: ['rank'], desc: '起始 45，季末低於 32 解職，扣分 ×1.6；球季過半先考核一次，跌破 20 當場解職。'},
  hell: {label: '地獄', start: 42, fire: 35, penalty: 2, checks: [.25, .5, .75], midFire: 25, winsBonus: 6, floor: .7, extra: ['rank', 'money'], desc: '起始 42，季末低於 35 解職，扣分 ×2；季中每四分之一考核一次，跌破 25 當場解職。'},
};
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'hell'];
const rankOf = id => DIFFICULTY_ORDER.indexOf(id);
export const difficultyOf = s => gmOf(s).difficulty;
export const difficultyInfo = s => DIFFICULTY[difficultyOf(s)];
/** Raising the difficulty is allowed only before the first game of a season (or between seasons). */
export const canRaiseDifficulty = s => (s.phase === 'regular' && s.day === 0) || (s.phase === 'finished' && !jobLost(s));
/** Lowest difficulty used for any part of a season. */
export const lowerDifficulty = (a, b) => rankOf(a) <= rankOf(b) ? a : b;
export function setDifficulty(s, level, {initial = false} = {}) {
  if (!DIFFICULTY[level]) return {ok: false, reason: '沒有這個難度。'};
  const g = gmOf(s), cur = g.difficulty;
  if (level === cur && !initial) return {ok: true};
  if (!initial && rankOf(level) > rankOf(cur) && !canRaiseDifficulty(s)) return {ok: false, reason: '球季開打後只能調低難度；調高要等新球季第 1 場之前。'};
  g.difficulty = level;
  // Nothing of this season has been played yet: the season counts at the new level.
  if (initial || (s.phase === 'regular' && s.day === 0)) g.season.low = level;
  else if (s.phase !== 'finished') g.season.low = lowerDifficulty(g.season.low, level);
  if (initial) { delete s.board; g.history = []; }
  // Before the first game of a new career the board simply starts at the new level.
  else if (s.phase === 'regular' && s.day === 0 && !g.history.length && s.board && !s.board.result) s.board.confidence = DIFFICULTY[level].start;
  return {ok: true};
}
/** Fired and not yet hired elsewhere: the season cannot continue until the GM takes a job. */
export const jobLost = s => !!(s.board?.result?.fired && !s.board.result.handled);
export const TITLES = [
  {id: 'rookie', label: '菜鳥 GM', desc: '剛上任的第一個月。', effect: '其他球隊開價略為客氣（交易價碼 −2%）。', markup: .98},
  {id: 'tyrant', label: '暴君', desc: '一季內撤換總教練 2 次以上，或大量釋出球員。', effect: '球員人人自危（氣氛 −4），董事會考核 −4，鄉民好感慢慢下降。', board: -4, drift: -.05, morale: -4},
  {id: 'handsoff', label: '無為而治', desc: '一個月以上沒有交易、釋出或插手打線。', effect: '球員很自在（氣氛 +3），但董事會覺得你沒作為（考核 −3）。', board: -3, morale: 3},
  {id: 'genius', label: '金頭腦', desc: '至少兩筆交易，整體戰力淨增加，而且沒有倒貼現金。', effect: '董事會考核 +3；其他球隊對你戒心變重（交易價碼 +5%）。', board: 3, markup: 1.05},
  {id: 'trader', label: '交易狂人', desc: '一季完成 5 筆以上交易。', effect: '球隊不安定（氣氛 −2），其他球隊開價提高 3%。', markup: 1.03, morale: -2},
  {id: 'spender', label: '大撒幣', desc: '交易倒貼大量現金，或薪資用到預算 97% 以上。', effect: '鄉民愛死你，董事會皺眉（考核 −2）。', board: -2, drift: .04},
  {id: 'miser', label: '守財奴', desc: '一個月以上薪資不到預算 75%，也沒花錢補強。', effect: '老闆很滿意（考核 +1），鄉民覺得你在省錢擺爛。', board: 1, drift: -.04},
  {id: 'farmer', label: '農場主', desc: '25 歲以下球員吃下三成五以上的打席與投球局數。', effect: '鄉民對未來有期待；重建球隊的董事會考核 +2。', board: 2, boardIf: 'rebuilding', drift: .02},
  {id: 'seller', label: '清倉大師', desc: '一季送走 3 名以上 30 歲老將。', effect: '重建球隊董事會 +2，其他球隊董事會 −2；鄉民不捨。', board: 2, boardIf: 'rebuilding', boardElse: -2, drift: -.04},
  {id: 'nursing', label: '老人院院長', desc: '先發打線平均年齡 31 歲以上。', effect: '經驗豐富，但鄉民開始擔心「明年怎麼辦」。', drift: -.01},
  {id: 'control', label: '控制狂', desc: '八成以上的比賽都是你自己排打線。', effect: '總教練覺得被架空（氣氛 −2）。', morale: -2},
  {id: 'friend', label: '球員之友', desc: '球隊氣氛長期維持在 70 以上。', effect: '鄉民好感慢慢上升。', drift: .03},
  {id: 'gambler', label: '豪賭客', desc: '兩次以上拿高潛力年輕球員換老將。', effect: '鄉民熱血沸騰，董事會擔心未來（考核 −2）。', board: -2, drift: .03},
  {id: 'champion', label: '冠軍操盤手', desc: '帶隊拿過總冠軍。', effect: '董事會耐心大增（考核 +5）。', board: 5},
];
const TITLE = Object.fromEntries(TITLES.map(t => [t.id, t]));
function earnedTitles(s, data) {
  const g = gmOf(s), c = g.season, f = s.finance[s.teamId], pay = payroll(s, data, s.teamId), out = [];
  const youth = youthShare(s, data), lineup = (s.teams[s.teamId].lineup || []).map(id => data.players.find(p => p.id === id)).filter(Boolean);
  const scale = moneyScale(s) || 1;
  if (g.career.seasons === 0 && s.day < 30 && g.career.days < 30) out.push('rookie');
  if (c.managerFires >= 2 || c.releases >= 3 || c.managerFires >= 1 && c.releases >= 2) out.push('tyrant');
  if (c.days >= 30 && !c.trades && !c.releases && !c.managerFires && c.selfDays === 0) out.push('handsoff');
  if (c.trades >= 2 && c.tradeGain >= 1 && c.tradeCashOut <= c.tradeCashIn) out.push('genius');
  if (c.trades >= 5) out.push('trader');
  if (c.tradeCashOut >= 3000000 * scale || pay >= f.budget * .97) out.push('spender');
  if (c.days >= 30 && pay <= f.budget * .75 && c.tradeCashOut === 0) out.push('miser');
  if (c.days >= 20 && youth >= .35) out.push('farmer');
  if (c.vetsSold >= 3) out.push('seller');
  if (lineup.length === 9 && lineup.reduce((a, p) => a + playerAge(s, p), 0) / 9 >= 31) out.push('nursing');
  if (c.days >= 20 && c.selfDays / c.days >= .8) out.push('control');
  if (c.days >= 20 && c.moraleSum / c.days >= 70) out.push('friend');
  if (c.youngSold >= 2) out.push('gambler');
  if (g.career.champions > 0) out.push('champion');
  return out;
}
/** Recomputes titles; announces new ones and applies their one-time morale effect. */
export function refreshTitles(s, data) {
  const g = gmOf(s), now = earnedTitles(s, data), had = new Set(g.titles.map(t => t.id));
  for (const id of now) if (!had.has(id)) {
    const t = TITLE[id];
    if (t.morale) { const c = s.teams[s.teamId]; c.morale = clamp((c.morale ?? 50) + t.morale, 0, 100); }
    if (id !== 'rookie') {
      addNews(s, {category: 'decision', teamIds: [s.teamId], title: `GM 新評價：「${t.label}」`, text: `${t.desc}${t.effect}`});
      fanReact(s, data, 'title', {title: t.label}, 0);
    }
  }
  g.titles = now.map(id => g.titles.find(t => t.id === id) || {id, since: s.day, year: seasonYear(s)});
  return g.titles;
}
export const titleInfo = id => TITLE[id];
/** Trade price multiplier from the GM's reputation (AI clubs ask more from a known shark). */
export function gmMarkup(s) { return (s.gm?.titles || []).reduce((m, t) => m * (TITLE[t.id]?.markup || 1), 1); }
function youthShare(s, data) {
  let young = 0, all = 0;
  for (const p of rosterFor(s, data, s.teamId)) {
    const v = (s.batting[p.id]?.pa || 0) + (s.pitching[p.id]?.outs || 0) * 1.3;
    all += v; if (playerAge(s, p) <= 25) young += v;
  }
  return all ? young / all : 0;
}

// ======================= Board goals and job security =======================
const GOAL_LABEL = {
  wins: g => `例行賽拿下 ${g.target} 勝`, playoffs: () => '打進季後賽', champion: () => '拿下總冠軍', payroll: g => `薪資控制在 US$${(g.target / 1e6).toFixed(2)}M 以內`,
  profit: () => '球季結束時現金不少於開季', rank: g => `例行賽排名第 ${g.target} 名以內`, attendance: g => `主場平均觀眾 ${g.target.toLocaleString('en-US')} 人以上`, youth: g => `25 歲以下球員累積 ${g.target} 打席＋投球出局數`,
};
function makeGoals(s, data) {
  const rep = teamReport(s, data, s.teamId), n = rep.n, rank = rep.strengthRank, games = seasonGames(s), f = s.finance[s.teamId];
  const strategy = rank <= Math.ceil(n / 3) ? 'contender' : rank > n - Math.ceil(n / 3) ? 'rebuilding' : 'middle';
  const d = difficultyInfo(s), pct = .5 + ((n + 1) / 2 - rank) / n * .22;
  // Harder levels expect more wins than the roster projects (easy keeps the old target).
  const wins = Math.min(Math.round(games * .8), Math.max(Math.round(games * .35), Math.round(games * pct) - 1) + d.winsBonus);
  const h = idHash(s.teamId, `goals|${seasonYear(s)}`), budgetRank = 1 + data.teams.filter(t => s.finance[t.id].budget > f.budget).length;
  const youthTarget = Math.round(games * 20);
  const attendanceGoal = () => {const prev = f.homeGames ? f.attendanceTotal / f.homeGames : homeAttendance(.5 + (pct - .5) * .5, f.ticketPrice); return {type: 'attendance', target: Math.round(prev * 1.02 / 100) * 100};};
  let goals;
  if (strategy === 'contender') goals = [{type: 'playoffs', weight: 40}, {type: 'wins', target: wins, weight: 30}, rank === 1 ? {type: 'champion', weight: 30} : {...attendanceGoal(), weight: 30}];
  else if (strategy === 'rebuilding') goals = [{type: 'youth', target: youthTarget, weight: 40}, {type: 'payroll', target: Math.round(f.budget * .85 / 10000) * 10000, weight: 30}, {type: 'wins', target: wins, weight: 30}];
  else goals = [{type: 'wins', target: wins, weight: 40}, h % 2 || budgetRank > n / 2 ? {type: 'profit', target: f.cash, weight: 30} : {...attendanceGoal(), weight: 30}, {type: 'playoffs', weight: 30}];
  // Hard and hell add goals: finish at or above the projected rank (hell: one better), and money.
  for (const x of d.extra) {
    if (x === 'rank') goals.push({type: 'rank', target: Math.max(1, rank - (difficultyOf(s) === 'hell' ? 1 : 0)), weight: 25});
    if (x === 'money') goals.push(goals.some(g => g.type === 'profit') ? {...attendanceGoal(), weight: 25} : {type: 'profit', target: f.cash, weight: 25});
  }
  const total = goals.reduce((a, g) => a + g.weight, 0);
  if (total !== 100) { goals.forEach(g => { g.weight = Math.round(g.weight * 100 / total); }); goals[0].weight += 100 - goals.reduce((a, g) => a + g.weight, 0); }
  return {goals: goals.map((g, i) => ({...g, id: `${g.type}${i}`})), strategy, expectedRank: rank};
}
/** The board for this team and season. Confidence carries over within the same club. */
export function boardOf(s, data) {
  const prev = s.board;
  if (!prev || prev.year !== seasonYear(s) || prev.teamId !== s.teamId) {
    const same = prev?.teamId === s.teamId;
    s.board = {year: seasonYear(s), teamId: s.teamId, confidence: same ? prev.confidence : difficultyInfo(s).start, startCash: s.finance[s.teamId].cash, ...makeGoals(s, data), result: null, midNoted: false, checks: 0, applied: 0};
  }
  return s.board;
}
export function goalProgress(s, data, g) {
  const t = s.teams[s.teamId], games = seasonGames(s), played = t.w + t.l, f = s.finance[s.teamId], left = Math.max(0, games - played), done = s.phase !== 'regular';
  const label = GOAL_LABEL[g.type](g);
  if (g.type === 'wins') {const proj = Math.round(t.w + left * (played ? t.w / played : .5)); return {label, now: `${t.w} 勝（預估 ${proj} 勝）`, score: clamp((done ? t.w : proj) / g.target, 0, 1.15), done};}
  if (g.type === 'playoffs' || g.type === 'champion') {
    const order = standings(s).map(([id]) => id), pos = order.indexOf(s.teamId) + 1, seeds = s.playoffs?.seeds, pic = currentPicture(s), inNow = pic.seeds.includes(s.teamId);
    // Close to a spot: within two places of the last team in (by the full table).
    const near = !inNow && pos <= Math.max(...pic.seeds.map(id => order.indexOf(id) + 1)) + 2;
    if (g.type === 'playoffs') {const inn = seeds ? seeds.includes(s.teamId) : inNow; return {label, now: seeds ? (inn ? '已晉級' : '未晉級') : inNow ? `目前在晉級區（${pic.notes[s.teamId] || '晉級'}）` : `目前不在晉級區（${pic.seeds.length} 隊晉級）`, score: inn ? 1 : seeds ? 0 : near ? .4 : .1, done: !!seeds};}
    const po = s.playoffs, finalTeams = po?.final ? (po.series[0]?.teams || po.history?.at(-1)?.series[0]?.teams || []) : [], inFinal = finalTeams.includes(s.teamId), champ = s.champion === s.teamId;
    return {label, now: champ ? '奪冠！' : s.phase === 'finished' ? (inFinal ? '總冠軍賽落敗' : '未奪冠') : seeds?.includes(s.teamId) ? '季後賽進行中' : `目前第 ${pos} 名`, score: champ ? 1 : inFinal ? .6 : seeds?.includes(s.teamId) ? .35 : inNow ? .3 : 0, done: s.phase === 'finished'};
  }
  if (g.type === 'rank') {const order = standings(s).map(([id]) => id), pos = order.indexOf(s.teamId) + 1; return {label, now: `目前第 ${pos} 名`, score: pos <= g.target ? 1 : clamp(1 - (pos - g.target) / Math.max(2, order.length / 4), 0, 1), done};}
  if (g.type === 'payroll') {const pay = payroll(s, data, s.teamId); return {label, now: `目前 US$${(pay / 1e6).toFixed(2)}M`, score: pay <= g.target ? 1 : clamp(1 - (pay - g.target) / g.target * 5, 0, 1), done};}
  if (g.type === 'profit') {const d = f.cash - (s.board?.startCash ?? f.cash); return {label, now: `${d >= 0 ? '+' : '−'}US$${(Math.abs(d) / 1e6).toFixed(2)}M`, score: d >= 0 ? 1 : clamp(1 + d / Math.max(1, s.board.startCash) * 4, 0, 1), done};}
  if (g.type === 'attendance') {const avg = f.homeGames ? Math.round(f.attendanceTotal / f.homeGames) : 0; return {label, now: f.homeGames ? `平均 ${avg.toLocaleString('en-US')} 人` : '尚未有主場比賽', score: f.homeGames ? clamp(avg / g.target, 0, 1.1) : .5, done};}
  if (g.type === 'youth') {let v = 0; for (const p of rosterFor(s, data, s.teamId)) if (playerAge(s, p) <= 25) v += (s.batting[p.id]?.pa || 0) + (s.pitching[p.id]?.outs || 0); const proj = played ? Math.round(v * games / played) : 0; return {label, now: `${v}（預估 ${proj}）`, score: clamp((done ? v : proj) / g.target, 0, 1.1), done};}
  return {label, now: '—', score: .5, done};
}
export function boardStatus(s, data) {
  const b = boardOf(s, data), goals = b.goals.map(g => ({...g, ...goalProgress(s, data, g)}));
  // Harder boards give no credit below the floor share of a goal and scale the rest (easy: linear, as before).
  const floor = difficultyInfo(s).floor, credit = x => floor ? clamp((Math.min(1, x) - floor) / (1 - floor), 0, 1) : Math.min(1, x);
  const grade = Math.round(goals.reduce((a, g) => a + g.weight * credit(g.score), 0));
  const fire = difficultyInfo(s).fire;
  const mood = b.confidence >= 75 ? '非常信任' : b.confidence >= 55 ? '支持' : b.confidence >= Math.max(35, fire + 5) ? '觀望' : b.confidence >= fire ? '不滿' : '準備換人';
  return {board: b, goals, grade, mood};
}
function titleBoardMod(s, strategy) {
  return (s.gm?.titles || []).reduce((a, t) => {const d = TITLE[t.id]; if (!d?.board) return a; if (d.boardIf) return a + (strategy === d.boardIf ? d.board : (d.boardElse || 0)); return a + d.board;}, 0);
}
/** Facts the GM career profile (career.js) needs about this season with this club. */
function careerFacts(s, data, b) {
  const t = s.teams[s.teamId], po = s.playoffs, games = seasonGames(s), jr = b.joinRecord || {w: 0, l: 0};
  const all = [...(po?.history || []).flatMap(h => h.series), ...(po?.series || [])];
  const budgets = data.teams.map(x => s.finance[x.id]?.budget || 0), lo = Math.min(...budgets), hi = Math.max(...budgets);
  const start = b.joinedDay ?? 0, end = s.phase === 'regular' ? s.day : games;
  return {league: s.league || data.league, w: t.w - jr.w, l: t.l - jr.l, playoffs: !!po?.seeds?.includes(s.teamId), rounds: all.filter(x => seriesWinner(x) === s.teamId).length,
    budgetPct: hi > lo ? (s.finance[s.teamId].budget - lo) / (hi - lo) : .5, share: clamp((end - start) / games, 0, 1), joined: b.joinedDay != null,
    titleIds: (gmOf(s).titles || []).map(x => x.id), ...contractFacts(s)};
}
/** GM contract (v3.7, jobs.js): the locked salary, and on a firing the pay still owed. */
function contractFacts(s) {
  const c = gmOf(s).contract; if (!c) return {};
  const left = Math.max(0, c.from + c.years - 1 - seasonYear(s));
  // owed: salary for the seasons after this one (paid out if the club fires the GM).
  return {contractSalary: c.salary, owed: left * c.salary};
}
/** Season review: grade, confidence change, and whether the GM keeps the job. */
export function reviewSeason(s, data) {
  const st = boardStatus(s, data), b = st.board;
  if (b.result) return b.result;
  const d = difficultyInfo(s);
  // Mid-season reviews already used part of the season's weight.
  const delta = confidenceDelta(s, st, b, 1 - (b.applied || 0));
  b.confidence = clamp(b.confidence + delta, 0, 100);
  // A GM hired during the season is not fired at its end.
  const fired = b.confidence < d.fire && b.joinedDay == null;
  const g = gmOf(s), t = s.teams[s.teamId];
  g.career.seasons++; if (s.champion === s.teamId) g.career.champions++; if (fired) g.career.fired++;
  for (const k of Object.keys(blankCounters())) g.career[k] = (g.career[k] || 0) + (g.season[k] || 0);
  g.history.unshift({year: seasonYear(s), teamId: s.teamId, team: club(data, s.teamId).zh, w: t.w, l: t.l, grade: st.grade, confidence: b.confidence, champion: s.champion === s.teamId, fired, difficulty: g.season.low, titles: (g.titles || []).map(x => TITLE[x.id]?.label).filter(Boolean), ...careerFacts(s, data, b)});
  b.result = {grade: st.grade, delta, fired, confidence: b.confidence, handled: !fired};
  if (fired) g.contract = null; // the club pays out the rest (career.js counts it as severance)
  refreshTitles(s, data);
  addNews(s, {category: 'decision', teamIds: [s.teamId], title: fired ? '董事會決定解除 GM 職務' : `董事會年度考核：${st.grade} 分`, text: fired ? `本季目標達成度 ${st.grade} 分，董事會信任度跌到 ${b.confidence}。球團決定換人。` : `目標達成度 ${st.grade} 分，董事會信任度 ${delta >= 0 ? '+' : ''}${delta}，目前 ${b.confidence}（${st.mood}）。`});
  fanReact(s, data, fired ? 'fired' : st.grade >= 80 ? 'reviewGood' : st.grade < 45 ? 'reviewBad' : 'reviewOk', {grade: st.grade}, 0);
  return b.result;
}
/** Confidence change for a review covering `weight` of the season; losses scale with difficulty. */
function confidenceDelta(s, st, b, weight) {
  const fans = (s.fans?.sentiment ?? 50) - 50, mods = titleBoardMod(s, b.strategy);
  const raw = ((st.grade - 60) * .6 + fans * .15 + mods) * weight;
  return Math.round(raw < 0 ? raw * difficultyInfo(s).penalty : raw);
}
/** Hard and hell: the board reviews during the regular season and may fire the GM on the spot. */
export function midSeasonReview(s, data) {
  const d = difficultyInfo(s), b = boardOf(s, data);
  if (s.phase !== 'regular' || b.result || b.joinedDay != null) return null;
  const games = seasonGames(s), due = d.checks.filter(x => s.day >= Math.floor(games * x)).length;
  if (due <= (b.checks || 0)) return null;
  const share = d.checks[due - 1] - (d.checks[(b.checks || 0) - 1] || 0);
  b.checks = due; b.applied = (b.applied || 0) + share;
  const st = boardStatus(s, data), delta = confidenceDelta(s, st, b, share);
  b.confidence = clamp(b.confidence + delta, 0, 100);
  const fired = b.confidence < d.midFire;
  if (fired) {
    const g = gmOf(s), t = s.teams[s.teamId];
    g.career.fired++;
    g.history.unshift({year: seasonYear(s), teamId: s.teamId, team: club(data, s.teamId).zh, w: t.w, l: t.l, grade: st.grade, confidence: b.confidence, champion: false, fired: true, midseason: true, difficulty: g.season.low, titles: (g.titles || []).map(x => TITLE[x.id]?.label).filter(Boolean), ...careerFacts(s, data, b), day: s.day});
    b.result = {grade: st.grade, delta, fired: true, midseason: true, confidence: b.confidence, handled: false, day: s.day};
    g.contract = null;
    addNews(s, {category: 'decision', teamIds: [s.teamId], title: '董事會季中解除 GM 職務', text: `季中考核 ${st.grade} 分，董事會信任度跌到 ${b.confidence}（${d.label}難度：低於 ${d.midFire} 當場解職）。球團決定立刻換人。`});
    fanReact(s, data, 'fired', {grade: st.grade}, 0);
  } else {
    addNews(s, {category: 'decision', teamIds: [s.teamId], title: `董事會季中考核：${st.grade} 分`, text: `信任度 ${delta >= 0 ? '+' : ''}${delta}，目前 ${b.confidence}（${st.mood}）。${d.label}難度：季中低於 ${d.midFire} 會當場解職。`});
  }
  return {grade: st.grade, delta, fired, confidence: b.confidence};
}
/** Clubs that would hire a fired GM: the weaker half of the league. */
export function jobOffers(s, data) {
  const rows = data.teams.filter(t => t.id !== s.teamId).map(t => ({id: t.id, zh: t.zh, rank: teamReport(s, data, t.id).strengthRank}));
  return rows.sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id)).slice(0, 3);
}
/** Move the GM to a new club in the same league (world save). Staff stays with the old club except the assistant. */
export function takeJob(w, s, data, teamId, {check = true, fromName = null} = {}) {
  if (check && !jobOffers(s, data).some(o => o.id === teamId)) throw new Error('這支球隊沒有提出邀請。');
  const oldTeam = s.teamId, midseason = s.phase !== 'finished';
  w.teamId = teamId; s.teamId = teamId; s.manualLineup = false; s.manager = null;
  if (s.board?.result) s.board.result.handled = true;
  // Easy keeps the old 55; harder levels start a new job lower. A mid-season hire is reviewed at
  // season's end (but not fired); an off-season hire starts fresh next season.
  const confidence = difficultyOf(s) === 'easy' ? 55 : difficultyInfo(s).start - 5;
  s.board = {year: seasonYear(s), teamId, confidence, startCash: s.finance[teamId].cash, ...makeGoals(s, data), result: midseason ? null : {handled: true, grade: null, newJob: true}, midNoted: true, ...(midseason ? {joinedDay: s.day, joinRecord: {w: s.teams[teamId].w, l: s.teams[teamId].l}, checks: 0, applied: 0} : {})};
  s.fans = {sentiment: 50, posts: [], seq: s.fans?.seq || 0};
  if (s.gm) s.gm.titles = (s.gm.titles || []).filter(t => t.id === 'champion');
  addNews(s, {category: 'decision', teamIds: [teamId, oldTeam].filter(Boolean), title: `新東家：接任${club(data, teamId).zh} GM`, text: `離開${fromName || club(data, oldTeam)?.zh || '原球團'}後，${club(data, teamId).zh} 邀請你接掌球團。${midseason ? '剩下的球季先熟悉球隊，季末考核不會解職。' : '新的董事會目標會在下個球季公布。'}`});
  fanReact(s, data, 'newGM', {}, 0);
  return s;
}

// ======================= Fans and pundits =======================
const FAN_IDS = ['紅土老球迷', 'bunt_king', '外野看台阿伯', 'K神', '牛棚觀察家', '全壘打牆', '三振王', 'ERA控', '主場常客', '熬夜看球', '小學就入坑', '季票持有人'];
const PUNDITS = ['球評 老K', '名嘴 阿德', '專欄「數據小站」', '退役捕手 阿明'];
const pick = (list, key) => list[idHash(key) % list.length];
function post(s, kind, text, mood, key) {
  const f = s.fans ??= {sentiment: 50, posts: [], seq: 0};
  const seq = ++f.seq, h = idHash(key || String(seq), String(seq)), heat = 5 + (h % 40);
  const push = Math.round(heat * clamp(.5 + mood * .5, .05, .95) + (f.sentiment - 50) / 5), boo = Math.max(0, heat - push);
  f.posts.unshift({id: seq, day: s.day, year: seasonYear(s), kind, author: kind === 'pundit' ? pick(PUNDITS, key + 'p' + seq) : pick(FAN_IDS, key + 'f' + seq), text, push: Math.max(0, push), boo});
  f.posts = f.posts.slice(0, 60);
}
const TEMPLATES = {
  win3: [v => `${v.n} 連勝啦！今年真的有東西`, v => `連贏 ${v.n} 場，GM 這次有做事`, v => `${v.n} 連勝，該不會要拚冠了吧`],
  lose3: [v => `${v.n} 連敗…GM 出來面對`, v => `又輸了，${v.n} 連敗，球票可以退嗎`, v => `${v.n} 連敗，總教練到底在排什麼`],
  blowoutWin: [v => `今天打爆對手 ${v.score}，爽！`, v => `${v.score} 大勝，${v.star} 太猛`],
  blowoutLoss: [v => `被打成 ${v.score}…看不下去`, v => `${v.score}，牛棚是不是該整個換掉`],
  tradeGood: [v => `用 ${v.out} 換到 ${v.inn}？GM 神操作`, v => `${v.inn} 來了！這交易我給 90 分`],
  tradeBad: [v => `${v.out} 就這樣被送走？我的青春…`, v => `${v.out} 換 ${v.inn}？GM 是不是對手派來的`, v => `賣掉 ${v.out}，球迷心寒`],
  tradeMeh: [v => `${v.out} 換 ${v.inn}，看不太懂但尊重`, v => `這筆交易要等幾個月才知道好壞`],
  release: [v => `${v.name} 被釋出了…一路好走`, v => `釋出 ${v.name}，薪水照付，GM 好大方`],
  fireManager: [v => `${v.old} 下台，換 ${v.name}，早該換了`, v => `${v.old} 被開除，鍋子都是總教練在背`],
  fireFast: [v => `${v.old} 才上任多久就被換？這 GM 是暴君吧`],
  title: [v => `GM 被封「${v.title}」XDDD`, v => `「${v.title}」這稱號太貼切了`],
  reviewGood: [v => `董事會給 GM ${v.grade} 分，明年續約穩了`], reviewOk: [v => `考核 ${v.grade} 分，不上不下`], reviewBad: [v => `考核才 ${v.grade} 分，GM 位子不保`],
  fired: [v => `GM 被開除了，下一位會更好嗎`], newGM: [v => `新 GM 來了，先觀望`], deadline: [v => `交易截止前還沒動作？GM 在睡覺嗎`],
  hot: [v => `${v.name} 最近打到不行，MVP 拿來`], champion: [v => `冠軍！！！GM 我錯怪你了`],
};
function fanReact(s, data, key, vars, delta) {
  const list = TEMPLATES[key]; if (!list) return;
  const f = s.fans ??= {sentiment: 50, posts: [], seq: 0};
  f.sentiment = clamp(f.sentiment + delta, 0, 100);
  post(s, 'fan', pick(list, key + JSON.stringify(vars) + s.day)(vars), delta > 0 ? 1 : delta < 0 ? -1 : 0, key + s.day);
}
export const fansOf = s => (s.fans ??= {sentiment: 50, posts: [], seq: 0});
export const sentimentLabel = v => v >= 75 ? '一片看好' : v >= 58 ? '偏正面' : v >= 42 ? '觀望' : v >= 25 ? '不滿' : '砲聲隆隆';
function punditColumn(s, data) {
  const rep = teamReport(s, data, s.teamId), st = boardStatus(s, data), name = club(data, s.teamId).zh;
  const weak = rep.weaknesses[0], strong = rep.strengths[0];
  const lines = [
    `${name}的${strong.label}是聯盟第 ${strong.rank}，可惜${weak.label}只排第 ${weak.rank}，補不起來就很難走遠。`,
    `從數據看，${name}${rep.rsRank ? `得分第 ${rep.rsRank}、失分第 ${rep.raRank}` : '樣本還太少'}；董事會的目標達成度目前大約 ${st.grade} 分。`,
    `GM 本季做了 ${gmOf(s).season.trades} 筆交易。${gmOf(s).season.trades ? '方向對不對，季末見真章。' : '再不動，截止日一過就沒機會了。'}`,
  ];
  const pay = payroll(s, data, s.teamId), budget = s.finance[s.teamId].budget, mgr = s.manager;
  lines.push(`薪資用了預算的 ${Math.round(pay / budget * 100)}%，${pay > budget * .95 ? '幾乎沒有補強空間。' : '還有餘裕在截止前補一塊拼圖。'}`);
  if (mgr) lines.push(`總教練 ${mgr.name} 走${MANAGER_STYLES[mgr.style].label}路線，${s.manualLineup ? '不過最近打線好像都是 GM 自己在排？' : '打線調度看得出個人風格。'}`);
  post(s, 'pundit', lines[Math.floor(s.day / 7) % lines.length], 0, 'col' + s.day);
}

// ======================= Daily hook =======================
function daily(s, data, results) {
  const g = gmOf(s); boardOf(s, data); managerOf(s);
  const c = g.season, f = fansOf(s), t = s.teams[s.teamId], game = results.find(x => x.away === s.teamId || x.home === s.teamId);
  c.days++; g.career.days = (g.career.days || 0); if (s.manualLineup && game) c.selfDays++; c.moraleSum += t.morale ?? 50;
  // Manager skill nudges morale.
  if (s.day % 4 === 0) t.morale = clamp(Math.round((t.morale ?? 50) + (s.manager.skill - 3)), 0, 100);
  if (game) {
    const won = game.winner === s.teamId, side = game.away === s.teamId ? 0 : 1, margin = game.score[side] - game.score[1 - side];
    f.sentiment = clamp(f.sentiment + (won ? .8 : -.8) + (game.postseason ? (won ? 1.5 : -1.5) : 0), 0, 100);
    f.streak = (Math.sign(f.streak || 0) === (won ? 1 : -1) ? f.streak : 0) + (won ? 1 : -1);
    if (Math.abs(f.streak) >= 3 && Math.abs(f.streak) % 2 === 1) fanReact(s, data, f.streak > 0 ? 'win3' : 'lose3', {n: Math.abs(f.streak)}, f.streak > 0 ? 1 : -1);
    else if (Math.abs(margin) >= 7) {
      const star = game.batters?.filter(b => b.team_id === s.teamId).sort((a, b) => b.rbi - a.rbi || b.h - a.h)[0];
      fanReact(s, data, margin > 0 ? 'blowoutWin' : 'blowoutLoss', {score: `${game.score[side]}：${game.score[1 - side]}`, star: data.players.find(p => p.id === star?.id)?.name || '打線'}, margin > 0 ? .5 : -.5);
    }
  }
  // Drift toward neutral plus title effects.
  const drift = (g.titles || []).reduce((a, x) => a + (TITLE[x.id]?.drift || 0), 0);
  f.sentiment = clamp(f.sentiment + (50 - f.sentiment) * .01 + drift * 10, 0, 100);
  if (s.phase === 'regular' && s.day % 7 === 0 && s.day > 0) punditColumn(s, data);
  if (s.phase === 'regular' && tradeDeadline(s) - s.day === 3 && !c.trades && teamStrategy(s, data, s.teamId) === 'contender') fanReact(s, data, 'deadline', {}, -1);
  const b = s.board;
  if (s.phase === 'regular' && !b.midNoted && s.day >= Math.floor(seasonGames(s) / 2)) {
    b.midNoted = true; const st = boardStatus(s, data);
    // Hard and hell hold a real review at this point instead (midSeasonReview).
    if (!difficultyInfo(s).checks.length) addNews(s, {category: 'decision', teamIds: [s.teamId], title: `董事會期中評估：目前 ${st.grade} 分`, text: `${st.goals.map(x => `${x.label}：${x.now}`).join('；')}。董事會態度：${st.mood}。`});
  }
  if (midSeasonReview(s, data)?.fired) return;
  refreshTitles(s, data);
  if (s.phase === 'finished') { if (s.champion === s.teamId) fanReact(s, data, 'champion', {}, 15); reviewSeason(s, data); }
}
function beforeTrade(s, data, input) {
  const o = normOffer(input), mine = (o.fromTeam || s.teamId) === s.teamId, other = mine ? o.targetTeam : o.fromTeam;
  if (!mine && other !== s.teamId && o.targetTeam !== s.teamId) return;
  const g = gmOf(s), c = g.season, outIds = mine ? o.give : o.get, inIds = mine ? o.get : o.give, cashOut = mine ? o.cash : -o.cash;
  const find = id => data.players.find(p => p.id === id), outs = outIds.map(find), inns = inIds.map(find);
  let gain = 0; try { gain = tradeImpact(s, data, o).delta; } catch { gain = 0; }
  c.trades++; c.tradeGain += gain; if (cashOut > 0) c.tradeCashOut += cashOut; else c.tradeCashIn += -cashOut;
  c.vetsSold += outs.filter(p => playerAge(s, p) >= 30).length;
  if (outs.some(p => playerAge(s, p) <= 25 && potential(p, s) >= ovr(p) + 5) && inns.some(p => playerAge(s, p) >= 30)) c.youngSold++;
  const bestOut = Math.max(...outs.map(ovr)), bestIn = Math.max(...inns.map(ovr)), fanDelta = clamp((bestIn - bestOut) * .8 + gain * 2, -8, 8);
  fanReact(s, data, fanDelta > 1.5 ? 'tradeGood' : fanDelta < -1.5 ? 'tradeBad' : 'tradeMeh', {out: outs.map(p => p.name).join('、'), inn: inns.map(p => p.name).join('、')}, fanDelta);
}
function afterRelease(s, data, p) {
  const c = gmOf(s).season; c.releases++;
  fanReact(s, data, 'release', {name: p.name}, ovr(p) >= 50 ? -3 : 0);
  refreshTitles(s, data);
}
// Register once even if this module is evaluated twice under different URLs.
if (!HOOKS.front) { HOOKS.front = true; HOOKS.daily.push(daily); HOOKS.beforeTrade.push(beforeTrade); HOOKS.release.push(afterRelease); }
HOOKS.userTradeMarkup = gmMarkup;

/** Make sure every GM-layer piece exists (old saves) without changing the season. */
export function ensureFront(s, data) { gmOf(s); boardOf(s, data); managerOf(s); fansOf(s); return s; }
