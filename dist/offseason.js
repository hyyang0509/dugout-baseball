// World offseason: expiring contracts, a cross-league free-agent market, foreign-player
// quotas, then the usual aging/retirement/rookie rollover for every league.
import {advanceSeason, contractAsk, releasePlayer, salaryFor, overall, hasBat, hasPitch, teamOf, random, addNews, salaryOf, marketSalary, LEAGUE_PAY, teamStrategy, playerAge, positionsOf, worldRating} from './engine.js?v=25';
import {LEAGUE_ORDER, LEAGUE_NAME, HOME_LEAGUE, isForeign, userSeason, worldDatas, finishWorld, ensureContracts, trimAI} from './world.js?v=25';

// How attractive a league is to a free agent, on top of the money.
// v2.0: gaps narrowed so more players cross leagues.
export const LEAGUE_PRESTIGE = {MLB: 1, NPB: 0.82, KBO: 0.74, CPBL: 0.64};
// Playing in your home country's league is worth a lot to most players.
export const HOME_BONUS = 1.35;
// Most foreign players a club may sign up to (existing rosters above it are grandfathered).
export const FOREIGN_QUOTA = {NPB: 10, KBO: 4, CPBL: 6};
// Expiring players below this world-scale level re-sign quietly as depth.
const MARKET_FLOOR = {MLB: 46, NPB: 43, KBO: 41, CPBL: 39};
const MAX_AI_SIGNINGS = 4, MAX_BID_YEARS = 4;
// Posting (入札): NPB/CPBL stars under contract may ask to move to MLB.
export const POSTING_MIN = 53, POSTING_FEE = 0.2;
const POST_APPROVE = {rebuilding: 0.8, balanced: 0.5, contender: 0.35};

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

const FIELD = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
/** First thing a roster is missing to survive a season, or null. */
export function rosterShortage(players) {
  const bats = players.filter(hasBat);
  for (const pos of FIELD) if (bats.filter(p => positionsOf(p).includes(pos)).length < 2) return pos;
  if (bats.length < 14) return 'BAT';
  if (players.filter(isPitcherOnly).length < 12) return 'P';
  return null;
}
const DEPTH_NAMES = {
  MLB: [['Matt', 'Kyle', 'Derek', 'Nick', 'Sam', 'Eric', 'Adam', 'Zach'], ['Baker', 'Scott', 'Price', 'Reed', 'Hayes', 'Ward', 'Cruz', 'Ortiz']],
  NPB: [['松田', '中島', '石川', '岡田', '森', '池田', '橋本', '藤井'], ['翼', '亮', '誠', '聖也', '大地', '海斗', '樹', '駿']],
  KBO: [['金', '李', '朴', '崔', '鄭', '姜', '趙', '尹'], ['俊浩', '賢宇', '成珉', '在勳', '東炫', '承佑', '泰俊', '志勳']],
  CPBL: [['林', '陳', '黃', '張', '李', '王', '吳', '劉'], ['冠宇', '柏翰', '家豪', '志偉', '俊傑', '建宏', '承恩', '宗翰']],
};
function depthPlayer(club, teamId, need, year, serial, rngState) {
  const pick = xs => xs[Math.floor(random(rngState) * xs.length)];
  const league = club.league, [a, b] = DEPTH_NAMES[league];
  const name = league === 'MLB' ? `${pick(a)} ${pick(b)}` : `${pick(a)}${pick(b)}`;
  const pitcher = need === 'P', position = pitcher ? 'P' : need === 'BAT' ? 'DH' : need;
  const local = () => 38 + Math.floor(random(rngState) * 8);
  const ratings = pitcher
    ? {stuff: local(), control: local(), movement: local(), stamina: 30}
    : {contact: local(), power: local(), eye: local(), speed: 45, defense: 45 + Math.floor(random(rngState) * 6)};
  for (const k of Object.keys(ratings)) ratings[k] = worldRating(league, k, ratings[k]);
  const age = 24 + Math.floor(random(rngState) * 6);
  return {id: `depth:${year}:${teamId}:${serial}`, name: `${name}（補強球員）`, team_id: teamId, league, origin: {NPB: 'JPN', KBO: 'KOR', CPBL: 'TWN'}[league] || 'INTL',
    position, positions: pitcher ? ['P'] : position === 'DH' ? ['DH'] : [position, 'DH'], role: pitcher ? 'RP' : null, ratings,
    birth_date: `${year - age}-04-01`, bats: 'R', throws: 'R', jersey_number: String(60 + serial % 39), status: 'Active', simulated: true};
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
  const freeAgents = [], resigned = {}, userExpiring = [], userControlled = [];
  user.offseasonTrades = true;
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
        if (id === w.userLeague && t.id === w.teamId && controlled) { resigned[id].push(p.id); userControlled.push({...entry, salary: controlledSalary(s, p, id)}); return; }
        if (id === w.userLeague && t.id === w.teamId) { const {ask, floor} = contractAsk(s, p, id); userExpiring.push({...entry, keep: true, years: contractLength(p, year, .5), ask, floor, salary: ask}); return; }
        // Young players are still under club control; low-level ones stay on as depth.
        if (ovr < MARKET_FLOOR[id] || controlled) { resigned[id].push(p.id); return; }
        let keep = rank < 12 ? 0.7 : rank < 26 ? 0.5 : 0.25;
        if (age >= 31) keep *= strategy === 'rebuilding' ? 0.4 : strategy === 'contender' ? 1.15 : 0.85;
        if (random(user) < keep) resigned[id].push(p.id); else freeAgents.push(entry);
      });
    }
  }
  // Players the user released during the season are on the open market.
  { const s = w.leagues[w.userLeague], data = datas[w.userLeague];
    for (const p of data.players) if (teamOf(s, p) === 'FA') {
      const ovr = Math.round(overall(p)), age = year - Number(p.birth_date?.slice(0, 4) || 1998);
      freeAgents.push({id: p.id, name: p.name, league: w.userLeague, teamId: 'FA', ovr, age, position: p.position, origin: p.origin || 'INTL', pitcher: isPitcherOnly(p), value: marketSalary(p)});
    } }
  // Posting requests from NPB/KBO/CPBL natives who are still under contract.
  const postingRequests = [];
  for (const id of ['NPB', 'KBO', 'CPBL']) {
    const s = w.leagues[id], data = datas[id];
    for (const t of data.teams) {
      const strategy = teamStrategy(s, data, t.id);
      for (const p of clubPlayers(w, datas, id, t.id)) {
        if ((s.contracts[p.id] ?? 1) <= 1 || HOME_LEAGUE[p.origin || 'INTL'] !== id) continue;
        const ovr = Math.round(overall(p)), age = year - Number(p.birth_date?.slice(0, 4) || 1998);
        if (ovr < POSTING_MIN || age < 22 || age > 31) continue;
        if (random(user) > (ovr >= 57 ? 0.65 : 0.4)) continue;
        const entry = {id: p.id, name: p.name, league: id, teamId: t.id, ovr, age, position: p.position, origin: p.origin || 'INTL', pitcher: isPitcherOnly(p), value: marketSalary(p), posting: true};
        if (id === w.userLeague && t.id === w.teamId) postingRequests.push({...entry, allow: false});
        else if (random(user) < POST_APPROVE[strategy]) freeAgents.push(entry);
      }
    }
  }
  freeAgents.sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name));
  w.offseason = {year, freeAgents, resigned, userExpiring, userControlled, postingRequests, bids: {}};
  const posted = freeAgents.filter(r => r.posting).length;
  addNews(user, {category: 'world', teamIds: [], title: `${year} 休賽季開始：自由球員市場開張`, text: `四個聯盟共有 ${freeAgents.length - posted} 名自由球員進入市場，另有 ${posted} 名日職、中職球員透過入札挑戰美職；你的球隊有 ${userExpiring.length} 名球員合約到期${postingRequests.length ? `，${postingRequests.length} 名球員提出入札請求` : ''}。`});
  return w;
}

export function setPostingDecision(w, id, allow) {
  const row = w.offseason?.postingRequests?.find(r => r.id === id);
  if (!row) throw new Error('找不到這筆入札請求。');
  row.allow = !!allow;
}

export function setExpiringDecision(w, id, keep) {
  const row = w.offseason?.userExpiring.find(r => r.id === id);
  if (!row) throw new Error('找不到這名到期球員。');
  row.keep = !!keep;
}
/** The user's re-signing offer. He signs at completion if the salary meets his (hidden) floor. */
export function setExpiringOffer(w, id, {salary, years}) {
  const row = w.offseason?.userExpiring.find(r => r.id === id);
  if (!row) throw new Error('找不到這名到期球員。');
  if (salary != null) row.salary = Math.max(10000, Math.round(Number(salary) / 10000) * 10000);
  if (years != null) row.years = clampYears(Number(years));
  row.keep = true;
  return row;
}
const clampYears = y => Math.max(1, Math.min(MAX_BID_YEARS, Math.round(y) || 1));
/** Club-controlled young players get a raise toward their market price instead of free agency. */
export function controlledSalary(s, p, league) {
  const market = leagueSalary(p, league), now = salaryFor(s, p);
  return Math.max(now, Math.round(market * .8 / 10000) * 10000);
}
/** Releases a player who is still under contract during the offseason: the rest of the deal is paid now. */
export function releaseInOffseason(w, bases, id) {
  const o = w.offseason; if (!o) throw new Error('目前不在休賽季。');
  const s = userSeason(w), data = worldDatas(w, bases)[w.userLeague];
  const r = releasePlayer(s, data, id), p = r.player;
  o.bids && delete o.bids[id];
  const age = o.year - Number(p.birth_date?.slice(0, 4) || 1998);
  o.freeAgents.push({id: p.id, name: p.name, league: w.userLeague, teamId: 'FA', ovr: Math.round(overall(p)), age, position: p.position, origin: p.origin || 'INTL', pitcher: isPitcherOnly(p), value: marketSalary(p)});
  o.freeAgents.sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name));
  return r;
}

/** Checks a bid for the user's club. Returns {ok, reason}. */
export function bidStatus(w, datas, id, {bonus, years}) {
  const o = w.offseason, fa = o?.freeAgents.find(r => r.id === id);
  if (!fa) return {ok: false, reason: '這名球員不在自由球員市場。'};
  if (fa.posting && w.userLeague !== 'MLB') return {ok: false, reason: '入札球員只有美職球隊可以出價。'};
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
  const contracts = Object.fromEntries(LEAGUE_ORDER.map(id => [id, {}])), salaries = Object.fromEntries(LEAGUE_ORDER.map(id => [id, {}]));
  const refused = [];
  const signed = new Set();
  // 1. Contracts that continue lose a year; AI re-signings and the user's choices get new deals.
  for (const id of LEAGUE_ORDER) for (const p of pools[id]) {
    const left = w.leagues[id].contracts?.[p.id] ?? 1;
    if (left > 1) { contracts[id][p.id] = left - 1; const sv = w.leagues[id]; salaries[id][p.id] = sv.pendingSalary?.[p.id] ?? sv.salaries?.[p.id] ?? leagueSalary(p, id); }
  }
  for (const id of LEAGUE_ORDER) for (const pid of o.resigned[id]) {
    const p = find(pid); contracts[id][pid] = contractLength(p, year, random(user));
    salaries[id][pid] = controlledSalary(w.leagues[id], p, id);
  }
  for (const r of o.userControlled || []) if (salaries[w.userLeague][r.id] != null) salaries[w.userLeague][r.id] = r.salary;
  const market = [...o.freeAgents];
  for (const r of o.userExpiring) {
    const floor = r.floor ?? 0, salary = r.salary ?? leagueSalary(find(r.id), w.userLeague);
    if (r.keep && salary >= floor) { contracts[w.userLeague][r.id] = r.years; salaries[w.userLeague][r.id] = salary; }
    else { if (r.keep) refused.push(r); market.push({...r, keep: undefined}); }
  }
  for (const r of o.postingRequests || []) if (r.allow) market.push({...r, allow: undefined});
  market.sort((a, b) => b.ovr - a.ovr);
  // 2. Free agents leave their clubs before anyone bids (posted players stay until sold).
  const free = new Set(market.filter(r => !r.posting).map(r => r.id));
  const rosters = {};
  for (const id of LEAGUE_ORDER) for (const t of datas[id].teams) rosters[t.id] = {league: id, players: pools[id].filter(p => p.team_id === t.id && !free.has(p.id)), signings: 0};
  const moves = [], departed = [], userSigned = [], userLost = [], returns = [], postings = [];
  let bonusPaid = 0, feeIncome = 0;
  const homeClub = (league, origin) => { const teams = Object.entries(rosters).filter(([id, c]) => c.league === league && id !== w.teamId); return teams.sort((a, b) => a[1].players.length - b[1].players.length || a[0].localeCompare(b[0]))[0]?.[0]; };
  for (const fa of market) {
    const p = find(fa.id);
    if (!p) continue;
    const offers = [];
    for (const [teamId, club] of Object.entries(rosters)) {
      const league = club.league, isUser = teamId === w.teamId;
      if (teamId === fa.teamId) continue; // he already said no to his old club
      if (fa.posting && league !== 'MLB') continue; // posting is only a route to MLB
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
    if (!offers.length) {
      if (fa.posting) { postings.push({...fa, sold: false}); continue; } // stays with his club
      // Players abroad with no offer go home instead of leaving baseball.
      const home = HOME_LEAGUE[p.origin || 'INTL'];
      if (home !== fa.league && home !== 'MLB' && (home === 'NPB' || home === 'KBO' || home === 'CPBL')) {
        const to = homeClub(home, p.origin);
        if (to) offers.push({teamId: to, league: home, bonus: 0, years: 1 + Math.floor(random(user) * 2), returning: true});
      }
      if (!offers.length) { departed.push(fa); if (fa.teamId === w.teamId) userLost.push({...fa, to: null}); continue; }
    }
    const best = offers.map(x => ({...x, value: offerValue(p, x.league, x.bonus, x.years)})).sort((a, b) => b.value - a.value || (a.user ? 1 : -1))[0];
    const club = rosters[best.teamId];
    // Move the player: out of his old league pool, into the new one.
    const fromLeague = where.get(p.id);
    pools[fromLeague] = pools[fromLeague].filter(q => q.id !== p.id);
    const moved = {...p, team_id: best.teamId, league: best.league};
    pools[best.league].push(moved); where.set(p.id, best.league);
    club.players.push(moved); club.signings++;
    if (fromLeague !== best.league) { delete contracts[fromLeague][p.id]; delete salaries[fromLeague][p.id]; }
    contracts[best.league][p.id] = best.years; salaries[best.league][p.id] = leagueSalary(p, best.league); signed.add(p.id);
    const move = {id: p.id, name: p.name, ovr: fa.ovr, fromLeague: fa.league, fromTeam: fa.teamId, toLeague: best.league, toTeam: best.teamId, years: best.years, bonus: best.bonus, posting: !!fa.posting, returning: !!best.returning};
    moves.push(move);
    if (best.returning) returns.push(move);
    if (fa.posting) {
      // The selling club gets a posting fee: a share of the new contract's value.
      const fee = Math.round((leagueSalary(p, 'MLB') * best.years + best.bonus) * POSTING_FEE / 10000) * 10000;
      move.fee = fee; postings.push({...fa, sold: true, move});
      const f = w.leagues[fa.league].finance?.[fa.teamId];
      if (f) { f.cash += fee; f.income = (f.income || 0) + fee; }
      if (fa.teamId === w.teamId) feeIncome += fee;
      // The old club's roster list for later bidding.
      const oldClub = rosters[fa.teamId]; if (oldClub) oldClub.players = oldClub.players.filter(q => q.id !== p.id);
    }
    if (best.user) { userSigned.push(move); bonusPaid += best.bonus; }
    if (fa.teamId === w.teamId) userLost.push({...fa, to: move});
  }
  // 3. Every club must still field a team: two players per position, 14 bats, 12 arms.
  //    Unsigned free agents fill holes first; otherwise a depth player is signed.
  const fillers = [];
  let fillSerial = 0;
  const unsigned = departed.map(r => find(r.id)).filter(Boolean);
  for (const [teamId, club] of Object.entries(rosters)) {
    for (let guard = 0; guard < 30; guard++) {
      const need = rosterShortage(club.players);
      if (!need) break;
      const fits = q => need === 'P' ? isPitcherOnly(q) : need === 'BAT' ? hasBat(q) : hasBat(q) && positionsOf(q).includes(need);
      const quotaOk = q => !isForeign(q, club.league) || foreignCount(club.players, club.league) < FOREIGN_QUOTA[club.league];
      const pickIdx = unsigned.map((q, i) => [q, i]).filter(([q]) => fits(q) && quotaOk(q)).sort((a, b) => overall(b[0]) - overall(a[0]))[0]?.[1];
      let p;
      if (pickIdx != null) {
        p = unsigned.splice(pickIdx, 1)[0];
        const fromLeague = where.get(p.id);
        pools[fromLeague] = pools[fromLeague].filter(q => q.id !== p.id);
        departed.splice(departed.findIndex(r => r.id === p.id), 1);
        delete contracts[fromLeague][p.id]; delete salaries[fromLeague][p.id];
        p = {...p, team_id: teamId, league: club.league};
      } else {
        p = depthPlayer(club, teamId, need, year, ++fillSerial, user);
      }
      pools[club.league].push(p); where.set(p.id, club.league); club.players.push(p);
      contracts[club.league][p.id] = 1; salaries[club.league][p.id] = leagueSalary(p, club.league);
      fillers.push({id: p.id, name: p.name, teamId, league: club.league, need});
    }
  }
  // 4. Unsigned free agents leave the three leagues.
  const gone = new Set(departed.map(r => r.id));
  for (const id of LEAGUE_ORDER) pools[id] = pools[id].filter(p => !gone.has(p.id));
  // 5. Hand each league its new player pool, then run the normal yearly rollover.
  const teamName = (league, teamId) => bases[league].teams.find(t => t.id === teamId)?.zh || teamId;
  const leagues = {};
  user.finance[w.teamId].cash -= bonusPaid;
  for (const id of LEAGUE_ORDER) {
    const s = w.leagues[id];
    s.playerPool = pools[id];
    s.ownership = {};
    const next = advanceSeason(s, bases[id]);
    next.contracts = contracts[id];
    next.salaries = salaries[id];
    ensureContracts(next, {players: next.playerPool});
    if (id !== w.userLeague) { next.aiOnly = true; trimAI(next); }
    leagues[id] = next;
  }
  const nextUser = leagues[w.userLeague];
  for (const r of refused) addNews(nextUser, {category: 'trade', teamIds: [w.teamId], title: `${r.name} 拒絕續約`, text: `球團開價年薪 US$${(r.salary || 0).toLocaleString('en-US')}，低於他的期待，他選擇投入自由球員市場。`});
  const cross = moves.filter(m => m.fromLeague !== m.toLeague);
  nextUser.offseason.market = {userSigned, userLost, bonusPaid, feeIncome, moves: moves.slice(0, 40), cross: cross.slice(0, 40), departed: departed.length, total: moves.length, crossTotal: cross.length, returns, postings};
  const myFill = fillers.filter(f => f.teamId === w.teamId);
  if (myFill.length) addNews(nextUser, {category: 'trade', teamIds: [w.teamId], title: '補強板凳深度', text: `名單守位或人數不足，球團簽下：${myFill.map(f => f.name).join('、')}（一年約）。`});
  for (const r of postings) addNews(nextUser, {category: 'world', teamIds: r.teamId === w.teamId ? [w.teamId] : [], title: r.sold ? `入札成功：${r.name} 加盟${teamName('MLB', r.move.toTeam)}` : `入札無人得標：${r.name} 留在${teamName(r.league, r.teamId)}`, text: r.sold ? `${teamName(r.league, r.teamId)}收到轉隊費 US$${r.move.fee.toLocaleString('en-US')}。${r.move.years} 年合約。` : '沒有美職球隊出價，合約照舊。'});
  for (const m of returns) addNews(nextUser, {category: 'world', teamIds: [], title: `旅外回流：${m.name} 回到${LEAGUE_NAME[m.toLeague]}`, text: `${m.name} 在${LEAGUE_NAME[m.fromLeague]}沒有拿到合約，回到母國聯盟加盟${teamName(m.toLeague, m.toTeam)}。`});
  const rejected = (o.postingRequests || []).filter(r => !r.allow);
  if (rejected.length) { const club = nextUser.teams[w.teamId]; club.morale = Math.max(0, (club.morale ?? 50) - 5 * rejected.length); addNews(nextUser, {category: 'clubhouse', teamIds: [w.teamId], title: '入札請求被拒，球員失望', text: `${rejected.map(r => r.name).join('、')} 想挑戰美職但球團不放行，球隊氣氛下降。`}); }
  addNews(nextUser, {category: 'world', teamIds: [], title: `自由球員市場落幕：${moves.length} 人簽約，${cross.length} 人跨聯盟`, text: cross.slice(0, 6).map(m => `${m.name}（${LEAGUE_NAME[m.fromLeague]}→${teamName(m.toLeague, m.toTeam)}）`).join('、') + (cross.length ? '。' : '今年沒有跨聯盟移籍。')});
  for (const m of userSigned) addNews(nextUser, {category: 'trade', teamIds: [w.teamId], title: `簽下自由球員 ${m.name}`, text: `${m.years} 年合約，簽約金 US$${m.bonus.toLocaleString('en-US')}。來自${LEAGUE_NAME[m.fromLeague]}${teamName(m.fromLeague, m.fromTeam)}。`});
  for (const r of userLost) addNews(nextUser, {category: 'trade', teamIds: [w.teamId], title: `${r.name} 離隊`, text: r.to ? `以自由球員身分加盟${LEAGUE_NAME[r.to.toLeague]}${teamName(r.to.toLeague, r.to.toTeam)}。` : '沒有球隊提出合約，離開職棒。'});
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
