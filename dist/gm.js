// DUGOUT front office: team strength profile, league ranks, trade impact and the chief assistant.
// Everything here reads the season; only hiring an assistant changes it (through hireAssistant).
import {rosterFor, autoLineup, assignFielding, hasBat, hasPitch, batValue, pitchValue, defenseAt, ovr, potential, playerAge,
  salaryOf, salaryFor, g100, g100delta, contractYears, payroll, teamStrategy, untouchables, evaluateTrade, normOffer, tradeDeadline, idHash, moneyScale, teamOf, clamp, positionsOf, primaryPosition} from './engine.js?v=26';
import {batLine, pitchLine, leagueBaselines, opsPlus, eraPlus} from './stats.js?v=26';

export const CATEGORIES = [
  {key: 'offense', label: '打擊火力', hint: '先發九人的整體打擊能力'},
  {key: 'contact', label: '安打能力', hint: '先發九人的接觸能力'},
  {key: 'power', label: '長打', hint: '先發九人的長打能力'},
  {key: 'eye', label: '選球上壘', hint: '先發九人的選球能力'},
  {key: 'speed', label: '速度', hint: '先發九人的跑壘速度'},
  {key: 'defense', label: '守備', hint: '八個守位的守備（守非主守位會打折）'},
  {key: 'rotation', label: '先發輪值', hint: '前五名先發投手'},
  {key: 'bullpen', label: '牛棚', hint: '前七名後援投手'},
  {key: 'bench', label: '板凳深度', hint: '先發以外最好的四名打者'},
];
const WEIGHTS = {offense: .40, defense: .08, rotation: .30, bullpen: .14, bench: .08};
const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

/** Strength profile from ratings (not this season's luck). `moves` maps playerId -> new team for what-ifs. */
export function teamProfile(s, data, teamId, moves = null) {
  const view = moves ? {...s, ownership: {...s.ownership, ...moves}} : s;
  const roster = rosterFor(view, data, teamId).filter(p => !s.condition[p.id]?.injury);
  const lineup = autoLineup(roster, {}), byId = Object.fromEntries(roster.map(p => [p.id, p]));
  const bats = lineup.map(id => byId[id]);
  const fielding = assignFielding(lineup, {players: roster}) || {};
  const fielders = lineup.filter(id => fielding[id] && fielding[id] !== 'DH');
  const rate = key => avg(bats.map(p => p.ratings[key] || 45));
  const bench = roster.filter(p => hasBat(p) && !lineup.includes(p.id)).map(batValue).sort((a, b) => b - a).slice(0, 4);
  const arms = roster.filter(hasPitch).filter(p => !hasBat(p) || p.role);
  const starters = arms.filter(p => p.role === 'SP').map(ovr).sort((a, b) => b - a);
  const relievers = arms.filter(p => p.role !== 'SP').map(pitchValue).concat(starters.slice(5)).sort((a, b) => b - a);
  const rot = starters.slice(0, 5); while (rot.length < 5) rot.push(relievers.shift() ?? 35);
  const v = {
    offense: avg(bats.map(batValue)), contact: rate('contact'), power: rate('power'), eye: rate('eye'), speed: rate('speed'),
    defense: avg(fielders.map(id => defenseAt(byId[id], fielding[id]) ?? 45)),
    rotation: avg(rot), bullpen: avg(relievers.slice(0, 7)), bench: avg(bench) || 35,
  };
  v.strength = Object.entries(WEIGHTS).reduce((a, [k, w]) => a + v[k] * w, 0);
  return {values: v, lineup, fielding, emergency: lineup.filter(id => fielding[id] && !positionsOf(byId[id]).includes(fielding[id]))};
}

const memo = new WeakMap();
function cached(s, key, compute) {
  const stamp = `${s.year || 2026}|${s.day}|${s.tradeLog?.length || 0}|${Object.keys(s.ownership || {}).length}|${Object.values(s.condition || {}).filter(c => c.injury).length}`;
  let m = memo.get(s); if (!m || m.stamp !== stamp) { m = {stamp, v: new Map()}; memo.set(s, m); }
  if (!m.v.has(key)) m.v.set(key, compute());
  return m.v.get(key);
}
/** Every club's profile, with league ranks per category (1 = best). */
export function leagueProfiles(s, data) {
  return cached(s, 'league', () => {
    const rows = data.teams.map(t => ({teamId: t.id, ...teamProfile(s, data, t.id)}));
    for (const key of [...CATEGORIES.map(c => c.key), 'strength']) {
      const order = [...rows].sort((a, b) => b.values[key] - a.values[key]);
      order.forEach((r, i) => { (r.ranks ??= {})[key] = i + 1; });
    }
    return rows;
  });
}
const rankIn = (rows, teamId, key, value) => 1 + rows.filter(r => r.teamId !== teamId && r.values[key] > value).length;

/** Team report: values, ranks, strengths and weaknesses, plus actual run scoring and prevention. */
export function teamReport(s, data, teamId) {
  const rows = leagueProfiles(s, data), me = rows.find(r => r.teamId === teamId), n = rows.length;
  const cats = CATEGORIES.map(c => ({...c, value: me.values[c.key], rank: me.ranks[c.key]}));
  const core = cats.filter(c => ['offense', 'defense', 'rotation', 'bullpen', 'bench', 'power', 'eye', 'speed'].includes(c.key));
  const sorted = [...core].sort((a, b) => a.rank - b.rank);
  const t = s.teams[teamId], games = t.w + t.l;
  const perGame = key => data.teams.map(x => ({id: x.id, v: (s.teams[x.id][key] || 0) / Math.max(1, s.teams[x.id].w + s.teams[x.id].l)}));
  const rsRank = 1 + perGame('rs').filter(x => x.v > (t.rs || 0) / Math.max(1, games)).length;
  const raRank = 1 + perGame('ra').filter(x => x.v < (t.ra || 0) / Math.max(1, games)).length;
  return {teamId, n, cats, strength: me.values.strength, strengthRank: me.ranks.strength, strengths: sorted.slice(0, 2), weaknesses: sorted.slice(-2).reverse(),
    emergency: me.emergency, games, rsRank: games >= 5 ? rsRank : null, raRank: games >= 5 ? raRank : null};
}

/** What a trade does to one club: category values and ranks before and after. */
export function tradeImpact(s, data, input, teamId = s.teamId) {
  const o = normOffer(input), my = o.fromTeam || s.teamId, moves = {};
  for (const id of o.give) moves[id] = o.targetTeam;
  for (const id of o.get) moves[id] = my;
  const rows = leagueProfiles(s, data), before = rows.find(r => r.teamId === teamId), after = teamProfile(s, data, teamId, moves);
  const others = rows.filter(r => r.teamId !== teamId);
  const cats = [...CATEGORIES, {key: 'strength', label: '整體戰力'}].map(c => ({...c, before: before.values[c.key], after: after.values[c.key],
    rankBefore: before.ranks[c.key], rankAfter: rankIn(others.concat([{teamId, values: after.values}]), teamId, c.key, after.values[c.key])}));
  return {teamId, cats, delta: after.values.strength - before.values.strength, emergency: after.emergency};
}

// ---- Chief assistant ----
export const ASSISTANT_STYLES = {
  analyst: {label: '數據派', hint: '相信本季成績（OPS+、ERA+），樣本夠大才算數。', now: 1, future: .4, money: .4, stats: 1.2},
  scout: {label: '老派球探', hint: '看能力和潛力，喜歡年輕球員，不太信短期成績。', now: .8, future: 1.2, money: .3, stats: .2},
  accountant: {label: '精算師', hint: '薪資和現金最重要，討厭冤大頭合約。', now: .7, future: .6, money: 1.4, stats: .5},
  winnow: {label: '拚冠派', hint: '只看現在能不能贏，未來的事未來再說。', now: 1.5, future: .1, money: .2, stats: .7},
};
const NAMES = {
  MLB: ['Walt Brennan', 'Dee Morales', 'Hank Sutter', 'Rosa Klein', 'Gus Whitaker', 'Nina Park', 'Lou Castillo', 'Ben Archer'],
  NPB: ['高橋健司', '山本美咲', '佐藤剛', '中村直樹', '渡辺陽子', '小川誠', '木村浩二', '藤田真理'],
  KBO: ['韓志勳', '吳成民', '林在賢', '宋旻浩', '黃承佑', '申東赫', '徐俊英', '柳在明'],
  CPBL: ['陳志明', '林雅婷', '黃建勳', '張家瑋', '李宗憲', '吳佩珊', '王俊傑', '劉育誠'],
};
const STYLE_KEYS = Object.keys(ASSISTANT_STYLES);
function makeAssistant(league, seed, i, year) {
  const h = idHash(seed, `${year}|${i}`), names = NAMES[league] || NAMES.MLB;
  const skill = 2 + (h % 4), style = STYLE_KEYS[(h >>> 4) % STYLE_KEYS.length];
  return {id: `asst:${year}:${i}:${h % 997}`, name: names[(h >>> 8) % names.length], style, skill, fee: Math.round(skill * skill * 40000 / 10000) * 10000};
}
/** The club's assistant; older saves get one on first use (free). */
export function assistantOf(s) {
  s.assistant ??= {...makeAssistant(s.league || 'MLB', s.teamId, 0, s.year || 2026), hiredDay: s.day, fee: 0};
  return s.assistant;
}
export const assistantFee = (s, a) => Math.max(10000, Math.round(a.fee * moneyScale(s) / 10000) * 10000);
/** Three candidates per season, stable within the season. */
export function assistantCandidates(s) {
  const cur = assistantOf(s);
  const seen = new Set([cur.name]), out = [];
  for (let i = 1; out.length < 3 && i < 40; i++) { const a = makeAssistant(s.league || 'MLB', s.teamId, i, s.year || 2026); if (!seen.has(a.name)) { seen.add(a.name); out.push(a); } }
  return out;
}
export function hireAssistant(s, candidateId) {
  const c = assistantCandidates(s).find(a => a.id === candidateId);
  if (!c) return {ok: false, reason: '這位人選已不在名單上。'};
  const f = s.finance[s.teamId], fee = assistantFee(s, c);
  if (f.cash < fee) return {ok: false, reason: '球團現金不足以支付簽約金。'};
  f.cash -= fee; f.operatingCost = (f.operatingCost || 0) + fee;
  f.ledger?.unshift({day: s.day, type: 'staff', label: `聘請首席助理：${c.name}`, income: 0, salary: 0, cost: fee, attendance: 0, net: -fee});
  s.assistant = {...c, hiredDay: s.day};
  return {ok: true, assistant: s.assistant, fee};
}

const statScore = (s, p) => {
  const base = leagueBaselines(s);
  if (hasBat(p) && !(hasPitch(p) && !p.ratings.contact)) { const l = batLine(s.batting[p.id]); if (l.pa >= 60) return ((opsPlus(l, base) ?? 100) - 100) / 15; }
  if (hasPitch(p)) { const l = pitchLine(s.pitching[p.id]); if (l.outs >= 45) return ((eraPlus(l, base) ?? 100) - 100) / 20; }
  return 0;
};
const futureScore = (s, p) => { const age = playerAge(s, p), room = potential(p, s) - ovr(p); return (age <= 25 ? 1 : age <= 28 ? .5 : age >= 33 ? -.6 : 0) + room / 4; };
const STARS = n => '★'.repeat(n) + '☆'.repeat(5 - n);
export const assistantStars = a => STARS(a.skill);

/** The assistant's read on a trade, from the user's side. Better assistants misjudge less. */
export function assistantVerdict(s, data, input) {
  const a = assistantOf(s), st = ASSISTANT_STYLES[a.style], o = normOffer(input), mine = (o.fromTeam || s.teamId) === s.teamId;
  const out = (mine ? o.give : o.get).map(id => data.players.find(p => p.id === id)), inn = (mine ? o.get : o.give).map(id => data.players.find(p => p.id === id));
  if (out.some(p => !p) || inn.some(p => !p)) return null;
  const impact = tradeImpact(s, data, o);
  const strategy = teamStrategy(s, data, s.teamId), deadlineNear = tradeDeadline(s) - s.day <= 15;
  const ctxNow = strategy === 'contender' ? 1.3 : strategy === 'rebuilding' ? .6 : 1, ctxFuture = strategy === 'rebuilding' ? 1.4 : strategy === 'contender' ? .7 : 1;
  const sum = (list, fn) => list.reduce((x, p) => x + fn(p), 0);
  const cashToUs = mine ? -o.cash : o.cash, salaryDelta = sum(inn, p => salaryFor(s, p)) - sum(out, p => salaryFor(s, p)), scale = moneyScale(s) || 1;
  const futureDelta = sum(inn, p => salaryFor(s, p) * Math.max(0, contractYears(s, p) - 1)) - sum(out, p => salaryFor(s, p) * Math.max(0, contractYears(s, p) - 1));
  const parts = {
    now: impact.delta * 1.6 * ctxNow * (deadlineNear && strategy === 'contender' ? 1.2 : 1),
    future: (sum(inn, p => futureScore(s, p)) - sum(out, p => futureScore(s, p))) * .5 * ctxFuture,
    money: (cashToUs - salaryDelta * .6 - futureDelta * .3) / (2000000 * scale),
    stats: (sum(inn, p => statScore(s, p)) - sum(out, p => statScore(s, p))) * .6,
  };
  const noise = ((idHash(a.id, [...o.give, '|', ...o.get, o.cash].join(',')) % 1000) / 500 - 1) * (6 - a.skill) * .25;
  const score = parts.now * st.now + parts.future * st.future + parts.money * st.money + parts.stats * st.stats + noise;
  const verdict = score > 1 ? '強烈建議接受' : score > .3 ? '建議接受' : score > -.3 ? '可有可無' : score > -1 ? '建議拒絕' : '強烈反對';
  const tone = score > .3 ? 'good' : score < -.3 ? 'bad' : 'neutral';
  const reasons = [];
  const strengthCat = impact.cats.find(c => c.key === 'strength');
  const moved = impact.cats.filter(c => c.key !== 'strength' && Math.abs(c.after - c.before) >= .6).sort((x, y) => Math.abs(y.after - y.before) - Math.abs(x.after - x.before)).slice(0, 2);
  reasons.push(`整體戰力 ${impact.delta >= 0 ? '+' : ''}${g100delta(impact.delta).toFixed(1)}，聯盟排名 ${strengthCat.rankBefore} → ${strengthCat.rankAfter}。${moved.map(c => `${c.label}${c.after > c.before ? '變強' : '變弱'}（第 ${c.rankBefore} → ${c.rankAfter} 名）`).join('，')}${moved.length ? '。' : ''}`);
  const voice = {
    analyst: () => parts.stats > .3 ? '換來的人本季數據明顯比較好，這不是運氣。' : parts.stats < -.3 ? '送走的人本季成績比較好，數據不支持這筆交易。' : '雙方本季數據差不多，樣本也還不大。',
    scout: () => parts.future > .4 ? '換來的人還年輕、有成長空間，我看好。' : parts.future < -.4 ? '你送走的是有潛力的年輕人，幾年後可能後悔。' : '雙方的年齡和潛力差不多。',
    accountant: () => parts.money > .2 ? '這筆交易幫球團省錢或進帳。' : parts.money < -.2 ? `薪資多了 US$${Math.round(salaryDelta).toLocaleString('en-US')}${futureDelta > 0 ? `，之後幾年合約還要多背 US$${Math.round(futureDelta).toLocaleString('en-US')}` : ''}，${cashToUs < 0 ? '還要倒貼現金，' : ''}老闆不會高興。` : '財務上影響不大。',
    winnow: () => parts.now > .3 ? '今年就能多贏幾場，就做吧！' : parts.now < -.3 ? '這會讓我們現在變弱，我反對。' : '對今年的戰力幫助有限。',
  };
  reasons.push(voice[a.style]());
  if (impact.emergency.length) reasons.push('注意：交易後有守位要靠球員緊急代守。');
  if (a.skill <= 2) reasons.push('（老實說，我對這種判斷沒什麼把握。）');
  return {assistant: a, verdict, tone, score, reasons, impact};
}

/** Short dashboard briefing in the assistant's voice. Items: {tone, text, action?}. */
export function assistantReport(s, data) {
  return cached(s, 'report', () => buildReport(s, data));
}
function buildReport(s, data) {
  const a = assistantOf(s), rep = teamReport(s, data, s.teamId), items = [], n = rep.n;
  const strategy = teamStrategy(s, data, s.teamId), left = tradeDeadline(s) - s.day;
  items.push({tone: 'neutral', text: `整體戰力聯盟第 ${rep.strengthRank} 名（共 ${n} 隊）。強項：${rep.strengths.map(c => `${c.label}（第 ${c.rank}）`).join('、')}；弱項：${rep.weaknesses.map(c => `${c.label}（第 ${c.rank}）`).join('、')}。`});
  if (rep.games >= 10) {
    const luck = (rep.rsRank + rep.raRank) / 2 - rep.strengthRank;
    if (luck >= n / 4) items.push({tone: 'bad', text: `實際得分第 ${rep.rsRank}、失分第 ${rep.raRank}，比陣容應有的表現差。${a.style === 'analyst' ? '數據會回歸，先別急著打掉重練。' : '球員可能還沒進入狀況。'}`});
    else if (luck <= -n / 4) items.push({tone: 'good', text: `實際得分第 ${rep.rsRank}、失分第 ${rep.raRank}，打得比陣容強。${a.style === 'analyst' ? '小心運氣成分，別高估自己。' : '氣勢正旺，好好把握。'}`});
  }
  if (rep.emergency.length) items.push({tone: 'bad', text: '有守位找不到合適的人，只能讓球員緊急代守，守備打很大折扣。建議補一名能守該位置的球員。', action: {type: 'nav', page: 'roster'}});
  if (s.phase === 'regular' && left > 0) {
    const weak = rep.weaknesses[0], target = suggestTarget(s, data, weak.key);
    if (target && (strategy !== 'rebuilding' || a.style === 'winnow')) items.push({tone: 'neutral', text: `${weak.label}是最大缺口。可以看看 ${target.team} 的 ${target.name}（總評 ${g100(target.ovr)}）：換來後整體戰力 +${g100delta(target.delta).toFixed(1)}。`, action: {type: 'trade', targetTeam: target.teamId, get: [target.id]}});
    if (strategy === 'contender' && left <= 15) items.push({tone: 'neutral', text: `離交易截止只剩 ${left} 天，我們在爭冠行列，${a.style === 'accountant' ? '補強可以，但別亂花錢。' : '現在是補強的最後機會。'}`});
    if (strategy === 'rebuilding' && left <= 20) {
      const vet = rosterFor(s, data, s.teamId).filter(p => playerAge(s, p) >= 31 && !s.condition[p.id].injury).sort((x, y) => ovr(y) - ovr(x))[0];
      if (vet) items.push({tone: 'neutral', text: `球隊在重建，${vet.name}（${playerAge(s, vet)} 歲、總評 ${g100(ovr(vet))}）趁截止前賣給爭冠隊，可以換到年輕球員。`, action: {type: 'trade', give: [vet.id]}});
    }
  }
  const f = s.finance[s.teamId], pay = payroll(s, data, s.teamId);
  if (a.style === 'accountant' || pay > f.budget * .95) items.push({tone: pay > f.budget * .95 ? 'bad' : 'neutral', text: `薪資已用預算的 ${Math.round(pay / f.budget * 100)}%${pay > f.budget * .95 ? '，再加薪資就會超支。' : '，還有空間。'}`});
  const tired = (s.teams[s.teamId].lineup || []).map(id => data.players.find(p => p.id === id)).filter(p => p && s.condition[p.id].energy < 40);
  if (tired.length && s.manualLineup) items.push({tone: 'bad', text: `手動打線裡 ${tired.map(p => p.name).join('、')} 體力不到 40%，表現會打折。`, action: {type: 'nav', page: 'roster'}});
  return {assistant: a, items: items.slice(0, 5), report: rep};
}
/** A gettable player who best patches a category. */
export function suggestTarget(s, data, key) {
  return cached(s, 'target|' + key, () => {
    const pitchingNeed = key === 'rotation' || key === 'bullpen', ratingKey = {contact: 'contact', power: 'power', eye: 'eye', speed: 'speed', defense: 'defense'}[key];
    const pool = [];
    for (const t of data.teams) {
      if (t.id === s.teamId) continue;
      const locked = untouchables(s, data, t.id);
      for (const p of rosterFor(s, data, t.id)) {
        if (locked.includes(p.id) || s.condition[p.id].injury) continue;
        if (pitchingNeed ? !(hasPitch(p) && !hasBat(p) && (key === 'rotation' ? p.role === 'SP' : p.role !== 'SP')) : !hasBat(p)) continue;
        pool.push({p, t, score: ratingKey ? (p.ratings[ratingKey] || 0) + batValue(p) * .3 : ovr(p)});
      }
    }
    const top = pool.sort((x, y) => y.score - x.score).slice(0, 10);
    let best = null;
    for (const {p, t} of top) {
      const delta = tradeImpact(s, data, {targetTeam: t.id, give: [], get: [p.id]}).delta;
      const cost = salaryFor(s, p) / (1000000 * (moneyScale(s) || 1));
      const value = delta - cost * .05;
      if (delta > .2 && (!best || value > best.value)) best = {id: p.id, name: p.name, teamId: t.id, team: t.zh, ovr: ovr(p), delta, value};
    }
    return best;
  });
}
