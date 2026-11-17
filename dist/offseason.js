// World offseason: expiring contracts, a cross-league free-agent market, foreign-player
// quotas, then the usual aging/retirement/rookie rollover for every league.
import {advanceSeason, overall, hasBat, hasPitch, teamOf, random, addNews, salaryOf, marketSalary, LEAGUE_PAY, teamStrategy, playerAge} from './engine.js?v=15';
import {LEAGUE_ORDER, LEAGUE_NAME, HOME_LEAGUE, isForeign, userSeason, worldDatas, finishWorld, ensureContracts, trimAI} from './world.js?v=15';

// How attractive a league is to a free agent, on top of the money.
export const LEAGUE_PRESTIGE = {MLB: 1, NPB: 0.75, CPBL: 0.55};
// Playing in your home country's league is worth a lot to most players.
export const HOME_BONUS = 1.6;
// Most foreign players a club may sign up to (existing rosters above it are grandfathered).
export const FOREIGN_QUOTA = {NPB: 10, CPBL: 6};
// Expiring players below this world-scale level re-sign quietly as depth.
const MARKET_FLOOR = {MLB: 46, NPB: 42, CPBL: 36};
const MAX_AI_SIGNINGS = 3, MAX_BID_YEARS = 4;

const isPitcherOnly = p => hasPitch(p) && !hasBat(p);
const sameRole = (a, b) => isPitcherOnly(a) === isPitcherOnly(b);

export function contractLength(p, year, r) {
  const age = year - Number(p.birth_date?.slice(0, 4) || 1998);
  const span = age <= 27 ? 4 : age <= 31 ? 3 : age <= 34 ? 2 : 1;
  return 1 + Math.floor(r * span);
}

/** Yearly salary a player would earn in a given league (US$). */
export function leagueSalary(p, league) {
  return salaryOf({...p, league});
}

/** Utility a player gets from an offer: money, league level, and home comfort. */
export function offerValue(p, league, bonus, years) {
  const home = HOME_LEAGUE[p.origin || 'INTL'] === league ? HOME_BONUS : 1;
  return (leagueSalary(p, league) + bonus / Math.max(1, years)) * LEAGUE_PRESTIGE[league] * home;
}

function clubPlayers(w, datas, league, teamId) {
  const s = w.leagues[league];
  return datas[league].players.filter(p => teamOf(s, p) === teamId);
}

function foreignCount(players, league) {
  return players.filter(p => isForeign(p, league)).length;
}

// Would this player crack the club's core (top 10 bats or top 12 arms)?
function clubNeeds(roster, p) {
  const peers = roster.filter(q => sameRole(q, p)).map(overall).sort((a, b) => b - a);
  const depth = isPitcherOnly(p) ? 12 : 10;
  return peers.length < depth || overall(p) > peers[depth - 1];
}

/** Ends the year: finishes every league and opens the free-agent market. Returns a new world. */
export function startOffseason(previous, bases) {
  const w = structuredClone(previous);
  if (w.offseason) return w;
  if (userSeason(w).phase !== 'finished') throw new Error('請先完成本季冠軍賽，再進入休賽季。');
  let datas = worldDatas(w, bases);
  finishWorld(w, datas);
  datas = worldDatas(w, bases);
  const user = userSeason(w), year = w.year;
  const freeAgents = [], resigned = {}, userExpiring = [];
  for (const id of LEAGUE_ORDER) {
    const s = w.leagues[id], data = datas[id];
    ensureContracts(s, data);
    resigned[id] = [];
    for (const t of data.teams) {
      const roster = clubPlayers(w, datas, id, t.id).sort((a, b) => overall(b) - overall(a));
      const strategy = teamStrategy(s, data, t.id);
      roster.forEach((p, rank) => {
        if ((s.contracts[p.id] ?? 1) > 1) return;
        const ovr = Math.round(overall(p)), age = year - Number(p.birth_date?.slice(0, 4) || 1998);
        const entry = {id: p.id, name: p.name, league: id, teamId: t.id, ovr, age, position: p.position, origin: p.origin || 'INTL', pitcher: isPitcherOnly(p), value: marketSalary(p)};
        const controlled = age <= (id === 'MLB' ? 26 : 27);
        if (id === w.userLeague && t.id === w.teamId && controlled) { resigned[id].push(p.id); return; }
        if (id === w.userLeague && t.id === w.teamId) { userExpiring.push({...entry, keep: true, years: contractLength(p, year, .5)}); return; }
        // Young players are still under club control; low-level ones stay on as depth.
        if (ovr < MARKET_FLOOR[id] || controlled) { resigned[id].push(p.id); return; }
        let keep = rank < 12 ? 0.7 : rank < 26 ? 0.5 : 0.25;
        if (age >= 31) keep *= strategy === 'rebuilding' ? 0.4 : strategy === 'contender' ? 1.15 : 0.85;
        if (random(user) < keep) resigned[id].push(p.id); else freeAgents.push(entry);
      });
    }
  }
  freeAgents.sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name));
  w.offseason = {year, freeAgents, resigned, userExpiring, bids: {}};
  addNews(user, {category: 'world', teamIds: [], title: `${year} 休賽季開始：自由球員市場開張`, text: `三個聯盟共有 ${freeAgents.length} 名自由球員進入市場；你的球隊有 ${userExpiring.length} 名球員合約到期。`});
  return w;
}

export function setExpiringDecision(w, id, keep) {
  const row = w.offseason?.userExpiring.find(r => r.id === id);
  if (!row) throw new Error('找不到這名到期球員。');
  row.keep = !!keep;
}

/** Checks a bid for the user's club. Returns {ok, reason}. */
export function bidStatus(w, datas, id, {bonus, years}) {
  const o = w.offseason, fa = o?.freeAgents.find(r => r.id === id);
  if (!fa) return {ok: false, reason: '這名球員不在自由球員市場。'};
  if (!Number.isFinite(bonus) || bonus < 0) return {ok: false, reason: '簽約金需為 0 以上的金額。'};
  if (!Number.isInteger(years) || years < 1 || years > MAX_BID_YEARS) return {ok: false, reason: `合約年限需為 1 到 ${MAX_BID_YEARS} 年。`};
  const user = userSeason(w), league = w.userLeague;
  const cash = user.finance?.[w.teamId]?.cash ?? 0;
  const committed = Object.entries(o.bids).filter(([pid]) => pid !== id).reduce((sum, [, b]) => sum + b.bonus, 0);
  if (bonus + committed > cash) return {ok: false, reason: `簽約金總額超過球團現金（US$${Math.round(cash).toLocaleString('en-US')}）。`};
  const p = datas[fa.league].players.find(q => q.id === id);
  if (p && isForeign(p, league)) {
    const roster = clubPlayers(w, datas, league, w.teamId).filter(q => !o.userExpiring.some(r => r.id === q.id && !r.keep));
    const pending = Object.keys(o.bids).filter(pid => pid !== id).map(pid => o.freeAgents.find(r => r.id === pid)).filter(r => r && HOME_LEAGUE[r.origin] !== league).length;
    if (foreignCount(roster, league) + pending >= FOREIGN_QUOTA[league]) return {ok: false, reason: `洋將名額已滿（${LEAGUE_NAME[league]}每隊最多 ${FOREIGN_QUOTA[league]} 名）。`};
  }
  return {ok: true};
}

export function setBid(w, datas, id, bid) {
  if (bid == null) { delete w.offseason.bids[id]; return {ok: true}; }
  const clean = {bonus: Math.round(Number(bid.bonus) / 10000) * 10000, years: Number(bid.years)};
  const status = bidStatus(w, datas, id, clean);
  if (status.ok) w.offseason.bids[id] = clean;
  return status;
}

/** Runs the market, applies contracts and moves, then rolls every league into next year. */
export function completeOffseason(previous, bases) {
  const w = structuredClone(previous), o = w.offseason;
  if (!o) throw new Error('目前不在休賽季。');
  const datas = worldDatas(w, bases), user = userSeason(w), year = o.year;
  // Every player of every league in one place, with its current club baked in.
  const pools = {}, where = new Map();
  for (const id of LEAGUE_ORDER) {
    const s = w.leagues[id];
    pools[id] = datas[id].players.map(p => ({...structuredClone(p), team_id: teamOf(s, p), league: id}));
    for (const p of pools[id]) where.set(p.id, id);
  }
  const find = pid => pools[where.get(pid)].find(p => p.id === pid);
  const contracts = Object.fromEntries(LEAGUE_ORDER.map(id => [id, {}]));
  const signed = new Set();
  // 1. Contracts that continue lose a year; AI re-signings and the user's choices get new deals.
  for (const id of LEAGUE_ORDER) for (const p of pools[id]) {
    const left = w.leagues[id].contracts?.[p.id] ?? 1;
    if (left > 1) contracts[id][p.id] = left - 1;
  }
  for (const id of LEAGUE_ORDER) for (const pid of o.resigned[id]) contracts[id][pid] = contractLength(find(pid), year, random(user));
  const market = [...o.freeAgents];
  for (const r of o.userExpiring) {
    if (r.keep) contracts[w.userLeague][r.id] = r.years;
    else market.push({...r, keep: undefined});
  }
  market.sort((a, b) => b.ovr - a.ovr);
  // 2. Free agents leave their clubs before anyone bids.
  const free = new Set(market.map(r => r.id));
  const rosters = {};
  for (const id of LEAGUE_ORDER) for (const t of datas[id].teams) rosters[t.id] = {league: id, players: pools[id].filter(p => p.team_id === t.id && !free.has(p.id)), signings: 0};
  const moves = [], departed = [], userSigned = [], userLost = [];
  let bonusPaid = 0;
  for (const fa of market) {
    const p = find(fa.id);
    if (!p) continue;
    const offers = [];
    for (const [teamId, club] of Object.entries(rosters)) {
      const league = club.league, isUser = teamId === w.teamId;
      if (teamId === fa.teamId) continue; // he already said no to his old club
      if (isUser) {
        const bid = o.bids[fa.id];
        if (!bid) continue;
        if (isForeign(p, league) && foreignCount(club.players, league) >= FOREIGN_QUOTA[league]) continue;
        offers.push({teamId, league, bonus: bid.bonus, years: bid.years, user: true});
        continue;
      }
      if (club.signings >= MAX_AI_SIGNINGS) continue;
      if (isForeign(p, league) && foreignCount(club.players, league) >= FOREIGN_QUOTA[league]) continue;
      if (!clubNeeds(club.players, p)) continue;
      const years = contractLength(p, year, random(user));
      const bonus = Math.round(leagueSalary(p, league) * years * (0.1 + random(user) * 0.5) / 10000) * 10000;
      offers.push({teamId, league, bonus, years});
    }
    if (!offers.length) { departed.push(fa); if (fa.teamId === w.teamId) userLost.push({...fa, to: null}); continue; }
    const best = offers.map(x => ({...x, value: offerValue(p, x.league, x.bonus, x.years)})).sort((a, b) => b.value - a.value || (a.user ? 1 : -1))[0];
    const club = rosters[best.teamId];
    // Move the player: out of his old league pool, into the new one.
    const fromLeague = where.get(p.id);
    pools[fromLeague] = pools[fromLeague].filter(q => q.id !== p.id);
    const moved = {...p, team_id: best.teamId, league: best.league};
    pools[best.league].push(moved); where.set(p.id, best.league);
    club.players.push(moved); club.signings++;
    contracts[best.league][p.id] = best.years; signed.add(p.id);
    const move = {id: p.id, name: p.name, ovr: fa.ovr, fromLeague: fa.league, fromTeam: fa.teamId, toLeague: best.league, toTeam: best.teamId, years: best.years, bonus: best.bonus};
    moves.push(move);
    if (best.user) { userSigned.push(move); bonusPaid += best.bonus; }
    if (fa.teamId === w.teamId) userLost.push({...fa, to: move});
  }
  // 3. Unsigned free agents leave the three leagues.
  const gone = new Set(departed.map(r => r.id));
  for (const id of LEAGUE_ORDER) pools[id] = pools[id].filter(p => !gone.has(p.id));
  // 4. Hand each league its new player pool, then run the normal yearly rollover.
  const teamName = (league, teamId) => bases[league].teams.find(t => t.id === teamId)?.zh || teamId;
  const leagues = {};
  user.finance[w.teamId].cash -= bonusPaid;
  for (const id of LEAGUE_ORDER) {
    const s = w.leagues[id];
    s.playerPool = pools[id];
    s.ownership = {};
    const next = advanceSeason(s, bases[id]);
    next.contracts = contracts[id];
    ensureContracts(next, {players: next.playerPool});
    if (id !== w.userLeague) { next.aiOnly = true; trimAI(next); }
    leagues[id] = next;
  }
  const nextUser = leagues[w.userLeague];
  const cross = moves.filter(m => m.fromLeague !== m.toLeague);
  nextUser.offseason.market = {userSigned, userLost, bonusPaid, moves: moves.slice(0, 40), cross: cross.slice(0, 40), departed: departed.length, total: moves.length};
  addNews(nextUser, {category: 'world', teamIds: [], title: `自由球員市場落幕：${moves.length} 人簽約，${cross.length} 人跨聯盟`, text: cross.slice(0, 6).map(m => `${m.name}（${LEAGUE_NAME[m.fromLeague]}→${teamName(m.toLeague, m.toTeam)}）`).join('、') + (cross.length ? '。' : '今年沒有跨聯盟移籍。')});
  for (const m of userSigned) addNews(nextUser, {category: 'trade', teamIds: [w.teamId], title: `簽下自由球員 ${m.name}`, text: `${m.years} 年合約，簽約金 US$${m.bonus.toLocaleString('en-US')}。來自${LEAGUE_NAME[m.fromLeague]}${teamName(m.fromLeague, m.fromTeam)}。`});
  for (const r of userLost) addNews(nextUser, {category: 'trade', teamIds: [w.teamId], title: `${r.name} 離隊`, text: r.to ? `以自由球員身分加盟${LEAGUE_NAME[r.to.toLeague]}${teamName(r.to.toLeague, r.to.toTeam)}。` : '沒有球隊提出合約，離開三大聯盟。'});
  for (const id of LEAGUE_ORDER) if (id !== w.userLeague) {
    const c = w.digest.find(d => d.league === id && d.year === w.year);
    if (c) addNews(nextUser, {category: 'world', teamIds: [], title: `${LEAGUE_NAME[id]}上季冠軍：${teamName(id, c.champion)}`, text: `${leagues[w.userLeague].year} 年${LEAGUE_NAME[id]}開季，衛冕軍是 ${teamName(id, c.champion)}。`});
  }
  const out = {...w, leagues, year: nextUser.year};
  delete out.offseason;
  return out;
}

/** Whole offseason with no user input (tests and quick rollovers). */
export function advanceWorld(previous, bases) {
  return completeOffseason(startOffseason(previous, bases), bases);
}

export {LEAGUE_PAY, playerAge};
