// GM job market (v3.7): GM contracts, offers by reputation, moving to another club or league,
// and waiting out a season without a club. Offers are seeded by world, year and situation,
// so reloading never rerolls them. The market lives on the user season (s.gmMarket).
import {LEAGUE_ORDER, LEAGUE_NAME, userSeason, worldDatas, trimAI, finishWorld} from './world.js?v=39';
import {addNews, idHash} from './engine.js?v=39';
import {teamReport} from './gm.js?v=39';
import {gmOf, takeJob, difficultyInfo, jobLost} from './front.js?v=39';
import {careerOf, reputationOf, salaryForBudget, worldIdOf} from './career.js?v=39';
import {startOffseason, completeOffseason} from './offseason.js?v=39';

export const LEAGUE_LEVEL = {CPBL: 0, KBO: 1, NPB: 2, MLB: 3};
/** Share of the remaining GM salary the new club pays the old one when hiring a GM under contract. */
export const COMPENSATION_RATE = .5;
export const MAX_OFFERS = 3;

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const clubName = (datas, league, teamId) => datas[league]?.teams.find(t => t.id === teamId)?.zh || teamId;
function budgetPct(s, data, teamId) {
  const all = data.teams.map(t => s.finance[t.id]?.budget || 0), lo = Math.min(...all), hi = Math.max(...all);
  return hi > lo ? ((s.finance[teamId]?.budget || 0) - lo) / (hi - lo) : .5;
}
export const clubSalary = (w, datas, league, teamId) => salaryForBudget(league, budgetPct(w.leagues[league], datas[league], teamId));
export const reputationNow = w => reputationOf(careerOf(w, gmOf(userSeason(w)).history || []));
/** Seasons left on the contract, counting the given year (1 = last season). */
export const yearsLeft = (c, year) => c ? c.from + c.years - year : 0;

/** Every GM with a club has a contract; older saves get a 3-year deal from the current season. */
export function ensureContract(w, datas) {
  if (!w?.gm || w.gm.unemployed || w.gm.retired) return null;
  const s = userSeason(w), g = gmOf(s);
  if (g.contract && g.contract.teamId === w.teamId && g.contract.league === w.userLeague) return g.contract;
  if (jobLost(s)) return null;
  g.contract = {teamId: w.teamId, league: w.userLeague, from: s.year, years: 3, salary: clubSalary(w, datas, w.userLeague, w.teamId)};
  return g.contract;
}

/** Why the GM is on the market right now, or null. */
export function marketReason(w) {
  // Once the off-season market is open the GM decision is made (the off-season belongs to one club).
  if (!w?.gm || w.gm.retired || w.offseason) return null;
  const s = userSeason(w);
  if (w.gm.unemployed) return s.phase === 'finished' && w.gm.waited ? 'waiting' : null;
  if (jobLost(s)) return s.phase === 'finished' ? 'fired' : 'midseason';
  if (s.phase !== 'finished') return null;
  const c = gmOf(s).contract;
  if (c && c.from > s.year) return null; // already signed (renewed or moved) for next season
  return yearsLeft(c, s.year) <= 1 ? 'expired' : 'poach';
}

// Which clubs listen to a GM with this reputation. Levels: league strength (MLB highest).
function eligible(rep, from, to, tier) {
  if (to === from) return tier === 'weak' || (tier === 'mid' && rep >= 40) || (tier === 'strong' && rep >= 55);
  if (to < from) return rep >= (tier === 'weak' ? 45 : 55);
  if (to === from + 1) return rep >= (tier === 'weak' ? 75 : tier === 'mid' ? 85 : 90);
  return rep >= (tier === 'weak' ? 85 : 92);
}
function offerCount(reason, rep, r) {
  if (reason === 'expired') return 2 + (r() < .5 ? 1 : 0);
  if (reason === 'poach') return rep < 55 ? 0 : rep < 75 ? (r() < .5 ? 1 : 0) : 1 + (r() < .5 ? 1 : 0);
  // Fired, or back from a year away: a very low reputation can mean nobody calls.
  if (rep < (reason === 'waiting' ? 15 : 20) && r() < .5) return 0;
  return 1 + (r() < .4 ? 1 : 0);
}

/** Offers for the GM's current situation. */
export function gmOffers(w, datas, reason = marketReason(w)) {
  if (!reason) return [];
  const s = userSeason(w), g = gmOf(s), rep = reputationNow(w), year = s.year;
  const cur = w.gm?.unemployed ? null : w.teamId, from = LEAGUE_LEVEL[w.userLeague];
  const r = mulberry(idHash(worldIdOf(w), `${year}|${reason}|${cur}|${w.userLeague}`));
  // Mid-season, only clubs in the same league can hire (the other leagues keep their own calendar).
  const leagues = reason === 'midseason' ? [w.userLeague] : LEAGUE_ORDER;
  const curBudget = cur ? s.finance[cur]?.budget || 0 : 0;
  const cands = [];
  for (const L of leagues) {
    const sl = w.leagues[L], data = datas[L], n = data.teams.length;
    for (const t of data.teams) {
      if (t.id === cur) continue;
      const rank = teamReport(sl, data, t.id).strengthRank, tier = rank <= n / 3 ? 'strong' : rank > n - n / 3 ? 'weak' : 'mid';
      if (!eligible(rep, from, LEAGUE_LEVEL[L], tier)) continue;
      const stepUp = LEAGUE_LEVEL[L] > from || (L === w.userLeague && (sl.finance[t.id]?.budget || 0) > curBudget);
      cands.push({league: L, teamId: t.id, team: t.zh, rank, n, tier, stepUp, key: r()});
    }
  }
  cands.sort((a, b) => a.key - b.key);
  const want = Math.min(MAX_OFFERS, offerCount(reason, rep, r)), offers = [], perLeague = {};
  for (const c of cands) {
    if (offers.length >= want) break;
    if ((perLeague[c.league] || 0) >= 2) continue;
    perLeague[c.league] = (perLeague[c.league] || 0) + 1;
    const {key, ...o} = c;
    o.years = 2 + Math.floor(r() * 3);
    o.salary = clubSalary(w, datas, c.league, c.teamId);
    if (reason === 'poach') {
      const left = yearsLeft(g.contract, year) - 1;
      o.compensation = Math.round(left * (g.contract?.salary || 0) * COMPENSATION_RATE / 1000) * 1000;
      o.blocked = !o.stepUp;
    }
    offers.push(o);
  }
  // The club itself offers a new deal when the contract runs out and the board still trusts the GM.
  if (reason === 'expired' && s.board && s.board.confidence >= difficultyInfo(s).fire + 10) {
    offers.unshift({own: true, league: w.userLeague, teamId: cur, team: clubName(datas, w.userLeague, cur), years: 2 + Math.floor(r() * 3),
      salary: Math.round((g.contract?.salary || clubSalary(w, datas, w.userLeague, cur)) * 1.05 / 1000) * 1000, stepUp: false});
  }
  return offers;
}

/** The market for now (computed once per situation, then kept in the save). */
export function ensureMarket(w, datas) {
  const reason = marketReason(w), s = userSeason(w);
  if (!reason) return null;
  const key = `${s.year}|${reason}|${w.gm?.unemployed ? 'none' : w.teamId}`;
  if (s.gmMarket?.key !== key) s.gmMarket = {key, year: s.year, reason, offers: gmOffers(w, datas, reason), choice: null};
  return s.gmMarket;
}
/** Whether the season may roll over: an expiring contract needs a decision first. */
export const marketDecided = w => { const m = userSeason(w).gmMarket; return marketReason(w) !== 'expired' || (m && m.choice != null); };

/** Accepts offer `index` of the current market. Mutates and returns the world. */
export function acceptOffer(w, bases, index) {
  const s = userSeason(w), m = s.gmMarket, o = m?.offers?.[index];
  if (!o) throw new Error('找不到這份邀約。');
  if (o.blocked) throw new Error('原球團不放人：合約期間只能接受更高層級聯盟或預算更大的球團。');
  let datas = worldDatas(w, bases);
  const fromLeague = w.userLeague, fromTeam = w.gm?.unemployed ? null : w.teamId, fromName = fromTeam ? clubName(datas, fromLeague, fromTeam) : null;
  const nextFrom = s.phase === 'finished' ? s.year + 1 : s.year;
  if (o.own) {
    gmOf(s).contract = {teamId: fromTeam, league: fromLeague, from: nextFrom, years: o.years, salary: o.salary};
    m.choice = index;
    addNews(s, {category: 'decision', teamIds: [fromTeam], title: `續任 ${fromName} GM`, text: `與球團簽下 ${o.years} 年新約（${nextFrom}–${nextFrom + o.years - 1}），遊戲年薪 US$${o.salary.toLocaleString('en-US')}。`});
    return w;
  }
  if (o.league !== fromLeague && s.phase !== 'finished') throw new Error('季中只能接任同聯盟的球隊。');
  if (m.reason === 'poach' && o.compensation) {
    w.leagues[o.league].finance[o.teamId].cash -= o.compensation;
    w.leagues[fromLeague].finance[fromTeam].cash += o.compensation;
    const last = gmOf(s).history?.[0];
    if (last && last.year === s.year && last.teamId === fromTeam) last.leftEarly = true;
  }
  const fromLabel = fromName ? (o.league === fromLeague ? fromName : `${LEAGUE_NAME[fromLeague]}${fromName}`) : null;
  let ns = s;
  if (o.league === fromLeague) {
    delete s.aiOnly;
    takeJob(w, s, datas[o.league], o.teamId, {check: false, fromName: fromLabel});
  } else {
    // Cross-league move: finish the other leagues, then the GM and the user role move over.
    finishWorld(w, datas); datas = worldDatas(w, bases);
    const old = s; ns = w.leagues[o.league];
    ns.gm = old.gm; ns.gmMarket = old.gmMarket;
    for (const k of ['gm', 'gmMarket', 'board', 'fans', 'manager']) delete old[k];
    old.teamId = null; old.aiOnly = true; old.manualLineup = false; old.event = null; trimAI(old);
    delete ns.aiOnly; ns.teamId = null; ns.event = null; ns.manualLineup = false;
    w.userLeague = o.league;
    takeJob(w, ns, datas[o.league], o.teamId, {check: false, fromName: fromLabel || '自由之身'});
  }
  gmOf(ns).contract = {teamId: o.teamId, league: o.league, from: nextFrom, years: o.years, salary: o.salary};
  if (m.reason === 'poach' && fromName) {
    addNews(ns, {category: 'decision', teamIds: [o.teamId], title: `GM 跳槽：離開${fromName}`, text: `新東家付給${fromName}補償金 US$${(o.compensation || 0).toLocaleString('en-US')}。原東家球迷對 GM 提前離隊相當不滿。`});
  }
  if (w.gm?.unemployed) { delete w.gm.unemployed; delete w.gm.waited; }
  ns.gmMarket.choice = index;
  return w;
}

/** The GM stops looking and waits: the user league plays on with the AI running the club. */
export function startWaiting(w) {
  const s = userSeason(w);
  w.gm.unemployed = {since: s.year, day: s.phase === 'regular' ? s.day : null};
  delete w.gm.waited;
  s.aiOnly = true; s.manualLineup = false; s.event = null;
  if (s.board?.result) s.board.result.handled = true;
  gmOf(s).contract = null;
  s.gmMarket = null;
  return w;
}
/** Waiting a full year: the off-season runs with default choices and the club stays AI-run. */
export function startIdleSeason(w, bases) {
  const nw = completeOffseason(startOffseason(w, bases), bases), s = userSeason(nw);
  s.aiOnly = true; s.manualLineup = false; s.event = null; s.gmMarket = null;
  delete nw.gm.waited;
  return nw;
}
/** Records a full season spent without a club (reputation recovers a little). */
export function recordIdleSeason(w) {
  const s = userSeason(w), g = gmOf(s);
  if (!g.history?.some(h => h.unemployed && h.year === s.year)) g.history.unshift({year: s.year, unemployed: true, league: w.userLeague, teamId: null, team: '', w: 0, l: 0});
  w.gm.waited = true; s.gmMarket = null;
  return w;
}
