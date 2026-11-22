// BM27 postseason formats, following each league's real rules on the game's 81-game season.
// Pure functions, no imports: the engine passes standings orders (team ids, best first).
//   MLB  : 6 per league (3 division winners + 3 wild cards). Wild Card Series (best of 3, all at the higher seed;
//          seeds 1-2 get a bye), Division Series (best of 5), LCS (best of 7), World Series (best of 7).
//   NPB  : Climax Series, top 3 per league. First stage 2 v 3 (best of 3, all at 2's park); final stage pennant
//          winner v survivor (first to 4 with a one-win advantage, all at the pennant winner's park); Japan Series (best of 7).
//   KBO  : top 5 step ladder. Wild card 4 v 5 (4th starts with one win, first to 2), semi-playoff v 3rd (best of 5),
//          playoff v 2nd (best of 5), Korean Series v 1st (best of 7, 2-3-2).
//   CPBL : two half seasons. Different half champions: the one with the better full-season record goes to the Taiwan
//          Series; the other plays the best remaining team in the challenge series (first to 3, starting with one win).
//          One team wins both halves: it starts the Taiwan Series with one win; 2nd v 3rd overall play the challenge series.
//   Other: top 4 (semifinal best of 3, final best of 5) for leagues without real-format data.
// Home pattern strings list the higher seed's (teams[0]) home games: H = teams[0] at home, L = teams[1] at home.

export const MLB_DIVISION = {
  'mlb:110': 'ALE', 'mlb:111': 'ALE', 'mlb:139': 'ALE', 'mlb:141': 'ALE', 'mlb:147': 'ALE',
  'mlb:114': 'ALC', 'mlb:116': 'ALC', 'mlb:118': 'ALC', 'mlb:142': 'ALC', 'mlb:145': 'ALC',
  'mlb:108': 'ALW', 'mlb:117': 'ALW', 'mlb:133': 'ALW', 'mlb:136': 'ALW', 'mlb:140': 'ALW',
  'mlb:120': 'NLE', 'mlb:121': 'NLE', 'mlb:143': 'NLE', 'mlb:144': 'NLE', 'mlb:146': 'NLE',
  'mlb:112': 'NLC', 'mlb:113': 'NLC', 'mlb:134': 'NLC', 'mlb:138': 'NLC', 'mlb:158': 'NLC',
  'mlb:109': 'NLW', 'mlb:115': 'NLW', 'mlb:119': 'NLW', 'mlb:135': 'NLW', 'mlb:137': 'NLW',
};
export const DIVISION_NAME = {ALE: '美聯東區', ALC: '美聯中區', ALW: '美聯西區', NLE: '國聯東區', NLC: '國聯中區', NLW: '國聯西區'};
export const NPB_LEAGUE = {'npb:g': 'CL', 'npb:t': 'CL', 'npb:db': 'CL', 'npb:c': 'CL', 'npb:s': 'CL', 'npb:d': 'CL',
  'npb:h': 'PL', 'npb:f': 'PL', 'npb:m': 'PL', 'npb:e': 'PL', 'npb:b': 'PL', 'npb:l': 'PL'};
const GROUP_NAME = {AL: '美國聯盟', NL: '國家聯盟', CL: '中央聯盟', PL: '太平洋聯盟'};

/** Which postseason a league plays. Falls back to a plain top 4 when the teams don't match the real league. */
export function formatFor(league, teamIds) {
  if (league === 'MLB' && teamIds.length === 30 && teamIds.every(id => MLB_DIVISION[id])) return 'mlb';
  if (league === 'NPB' && teamIds.length === 12 && teamIds.every(id => NPB_LEAGUE[id])) return 'npb';
  if (league === 'KBO' && teamIds.length >= 5) return 'kbo';
  if (league === 'CPBL' && teamIds.length >= 4) return 'cpbl';
  return 'top4';
}
/** Standings groups for display: MLB by league and division, NPB by league, others one table. */
export function standingGroups(format, order) {
  if (format === 'mlb') return ['AL', 'NL'].map(lg => ({key: lg, label: GROUP_NAME[lg], divisions: ['E', 'C', 'W'].map(d => ({key: lg + d, label: DIVISION_NAME[lg + d], ids: order.filter(id => MLB_DIVISION[id] === lg + d)}))}));
  if (format === 'npb') return ['CL', 'PL'].map(lg => ({key: lg, label: GROUP_NAME[lg], divisions: [{key: lg, label: null, ids: order.filter(id => NPB_LEAGUE[id] === lg)}]}));
  return [{key: 'all', label: null, divisions: [{key: 'all', label: null, ids: order}]}];
}

/**
 * Who would be in the postseason if it started now. `halves` (CPBL) is {first: order, second: order} or null.
 * Returns {seeds: [ids in seed order per group], notes: {id: label}, groups}.
 */
export function playoffPicture(format, order, halves = null) {
  const notes = {};
  if (format === 'mlb') {
    const groups = {};
    for (const lg of ['AL', 'NL']) {
      const teams = order.filter(id => MLB_DIVISION[id]?.startsWith(lg));
      const winners = ['E', 'C', 'W'].map(d => teams.find(id => MLB_DIVISION[id] === lg + d));
      const divSeeds = teams.filter(id => winners.includes(id));
      const wild = teams.filter(id => !winners.includes(id)).slice(0, 3);
      groups[lg] = [...divSeeds, ...wild];
      divSeeds.forEach((id, i) => { notes[id] = `${DIVISION_NAME[MLB_DIVISION[id]]}第一 · 第 ${i + 1} 種子`; });
      wild.forEach((id, i) => { notes[id] = `外卡 · 第 ${i + 4} 種子`; });
    }
    return {seeds: [...groups.AL, ...groups.NL], notes, groups};
  }
  if (format === 'npb') {
    const groups = {};
    for (const lg of ['CL', 'PL']) { groups[lg] = order.filter(id => NPB_LEAGUE[id] === lg).slice(0, 3); groups[lg].forEach((id, i) => { notes[id] = i ? `${GROUP_NAME[lg]}第 ${i + 1} 名` : `${GROUP_NAME[lg]}冠軍`; }); }
    return {seeds: [...groups.CL, ...groups.PL], notes, groups};
  }
  if (format === 'kbo') {
    const seeds = order.slice(0, 5); seeds.forEach((id, i) => { notes[id] = i ? `第 ${i + 1} 名` : '例行賽冠軍'; });
    return {seeds, notes, groups: {all: seeds}};
  }
  if (format === 'cpbl') {
    const first = (halves?.first || order)[0], second = (halves?.second || order)[0];
    if (first === second) {
      const rest = order.filter(id => id !== first).slice(0, 2);
      notes[first] = '上下半季冠軍'; rest.forEach((id, i) => { notes[id] = `全年第 ${order.indexOf(id) + 1} 名`; });
      return {seeds: [first, ...rest], notes, groups: {all: [first, ...rest]}, sweep: true};
    }
    const [better, worse] = order.indexOf(first) < order.indexOf(second) ? [first, second] : [second, first];
    const wild = order.find(id => id !== first && id !== second);
    notes[first] = '上半季冠軍'; notes[second] = '下半季冠軍'; notes[wild] = '季冠軍以外全年最佳';
    return {seeds: [better, worse, wild], notes, groups: {all: [better, worse, wild]}, sweep: false};
  }
  const seeds = order.slice(0, 4); seeds.forEach((id, i) => { notes[id] = `第 ${i + 1} 名`; });
  return {seeds, notes, groups: {all: seeds}};
}

const series = (key, label, high, low, need, pattern, adv = [0, 0]) => ({key, label, teams: [high, low], wins: [...adv], adv: [...adv], need, pattern, played: 0});
export const seriesDone = x => x.wins[0] >= x.need || x.wins[1] >= x.need;
export const seriesWinner = x => x.wins[0] >= x.need ? x.teams[0] : x.wins[1] >= x.need ? x.teams[1] : null;
/** Home and away for the next game of a series. */
export function seriesGame(x) {
  const high = (x.pattern[x.played] ?? x.pattern.at(-1)) === 'H';
  return high ? {away: x.teams[1], home: x.teams[0]} : {away: x.teams[0], home: x.teams[1]};
}
/** Short text for a series format, e.g. 五戰三勝 or 先得一勝・六戰四勝. */
export function seriesFormat(x) {
  const n = ['', '一', '二', '三', '四', '五', '六', '七'];
  if (x.adv.some(Boolean)) return `${x.adv[0] ? '上位' : '下位'}先得 1 勝・先拿 ${x.need} 勝`;
  return `${n[x.need * 2 - 1]}戰${n[x.need]}勝`;
}

const ROUND = {
  mlb: {wc: '外卡系列賽', ds: '分區系列賽', lcs: '聯盟冠軍賽', ws: '世界大賽'},
  npb: {first: '高潮系列賽第一階段', final: '高潮系列賽最終階段', js: '日本大賽'},
  kbo: {wc: '外卡決定戰', semi: '準季後賽', po: '季後賽', ks: '韓國大賽'},
  cpbl: {challenge: '季後挑戰賽', ts: '台灣大賽'},
  top4: {semifinal: '四強賽', final: '冠軍賽'},
};
export const roundName = po => ROUND[po.format]?.[po.round] || '季後賽';
const FINAL = {mlb: 'ws', npb: 'js', kbo: 'ks', cpbl: 'ts', top4: 'final'};

/** Opens the postseason. `order` is the full-season standings (best first). */
export function startPlayoffs(format, order, halves = null) {
  const pic = playoffPicture(format, order, halves), g = pic.groups, po = {format, seeds: pic.seeds, notes: pic.notes, groups: g, order, round: null, series: [], history: [], game: 0};
  if (format === 'mlb') { po.round = 'wc'; po.series = ['AL', 'NL'].flatMap(lg => [series(`${lg}-36`, `${GROUP_NAME[lg]} 3 對 6`, g[lg][2], g[lg][5], 2, 'HHH'), series(`${lg}-45`, `${GROUP_NAME[lg]} 4 對 5`, g[lg][3], g[lg][4], 2, 'HHH')]); }
  else if (format === 'npb') { po.round = 'first'; po.series = ['CL', 'PL'].map(lg => series(lg, `${GROUP_NAME[lg]} 2 對 3`, g[lg][1], g[lg][2], 2, 'HHH')); }
  else if (format === 'kbo') { po.round = 'wc'; po.series = [series('wc', '第 4 名 對 第 5 名', g.all[3], g.all[4], 2, 'HH', [1, 0])]; }
  else if (format === 'cpbl') {
    po.round = 'challenge'; po.sweep = pic.sweep;
    po.series = [pic.sweep ? series('challenge', '全年第 2 名 對 第 3 名', g.all[1], g.all[2], 3, 'HHLLH') : series('challenge', '半季冠軍 對 全年最佳', g.all[1], g.all[2], 3, 'HLHH', [1, 0])];
  } else { po.round = 'semifinal'; po.series = [series('a', '1 對 4', g.all[0], g.all[3], 2, 'HHL'), series('b', '2 對 3', g.all[1], g.all[2], 2, 'HHL')]; }
  po.roundLabel = roundName(po); po.final = po.round === FINAL[format];
  return po;
}
/** After every series in the round is done: the next round, or {champion}. Mutates and returns po. */
export function advancePlayoffs(po) {
  if (!po.series.every(seriesDone)) return po;
  const won = Object.fromEntries(po.series.map(x => [x.key, seriesWinner(x)])), g = po.groups, rank = id => po.order.indexOf(id);
  const byRecord = (a, b) => rank(a) <= rank(b) ? [a, b] : [b, a];
  po.history.push({round: po.round, label: po.roundLabel, series: po.series});
  if (po.final) { po.champion = won[po.series[0].key]; po.series = []; return po; }
  const f = po.format;
  if (f === 'mlb') {
    if (po.round === 'wc') { po.round = 'ds'; po.series = ['AL', 'NL'].flatMap(lg => [series(`${lg}-1`, `${GROUP_NAME[lg]}分區系列賽`, g[lg][0], won[`${lg}-45`], 3, 'HHLLH'), series(`${lg}-2`, `${GROUP_NAME[lg]}分區系列賽`, g[lg][1], won[`${lg}-36`], 3, 'HHLLH')]); }
    else if (po.round === 'ds') { po.round = 'lcs'; po.series = ['AL', 'NL'].map(lg => { const a = won[`${lg}-1`], b = won[`${lg}-2`], [h, l] = g[lg].indexOf(a) < g[lg].indexOf(b) ? [a, b] : [b, a]; return series(lg, `${GROUP_NAME[lg]}冠軍賽`, h, l, 4, 'HHLLLHH'); }); }
    else { po.round = 'ws'; const [h, l] = byRecord(won.AL, won.NL); po.series = [series('ws', '美聯冠軍 對 國聯冠軍', h, l, 4, 'HHLLLHH')]; }
  } else if (f === 'npb') {
    if (po.round === 'first') { po.round = 'final'; po.series = ['CL', 'PL'].map(lg => series(lg, `${GROUP_NAME[lg]}最終階段`, g[lg][0], won[lg], 4, 'HHHHHH', [1, 0])); }
    else { po.round = 'js'; const [h, l] = byRecord(won.CL, won.PL); po.series = [series('js', '央聯 對 洋聯', h, l, 4, 'HHLLLHH')]; }
  } else if (f === 'kbo') {
    const next = {wc: ['semi', 2, '第 3 名 對 外卡勝隊'], semi: ['po', 1, '第 2 名 對 準季後賽勝隊'], po: ['ks', 0, '例行賽冠軍 對 季後賽勝隊']}[po.round];
    const prev = won[po.series[0].key]; po.round = next[0];
    po.series = [po.round === 'ks' ? series('ks', next[2], g.all[0], prev, 4, 'HHLLLHH') : series(po.round, next[2], g.all[next[1]], prev, 3, 'HHLLH')];
  } else if (f === 'cpbl') {
    po.round = 'ts'; const champ = g.all[0], challenger = won.challenge;
    po.series = [po.sweep ? series('ts', '雙半季冠軍 對 挑戰賽勝隊', champ, challenger, 4, 'HHLLHH', [1, 0]) : series('ts', '全年較佳的半季冠軍 對 挑戰賽勝隊', champ, challenger, 4, 'HHLLHHH')];
  } else { po.round = 'final'; const [h, l] = byRecord(won.a, won.b); po.series = [series('final', '冠軍賽', h, l, 3, 'HHLHH')]; }
  po.roundLabel = roundName(po); po.final = po.round === FINAL[f];
  return po;
}

/** Converts a pre-v3.2 playoff state ({round:'semifinal'|'final', series:[{teams,wins}], game}) in place. */
export function migratePlayoffs(po) {
  if (!po || po.format) return po;
  const need = po.round === 'final' ? 3 : 2, pattern = po.round === 'final' ? 'HHLHH' : 'HHL';
  po.format = 'top4'; po.order = [...(po.seeds || [])]; po.groups = {all: [...(po.seeds || [])]}; po.history = []; po.notes = {};
  po.series = po.series.map((x, i) => ({key: po.round === 'final' ? 'final' : 'ab'[i], label: po.round === 'final' ? '冠軍賽' : i ? '2 對 3' : '1 對 4', teams: x.teams, wins: x.wins, adv: [0, 0], need, pattern, played: x.wins[0] + x.wins[1]}));
  po.roundLabel = roundName(po); po.final = po.round === 'final';
  return po;
}
