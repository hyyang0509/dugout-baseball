import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LEAGUES,saveKey} from '../dist/leagues.js';
import {makeSeason,makeSchedule,nextDay,resolveEvent,assignFielding,advanceSeason,seasonData,migrateSeason,payroll,evaluateTrade,executeTrade,rosterFor} from '../dist/engine.js';

test('league save slots preserve the original MLB key',()=>{
 assert.equal(saveKey('MLB'),'dugout.save.v1');
 assert.equal(new Set(Object.keys(LEAGUES).map(saveKey)).size,4);
});
for(const league of ['CPBL','NPB','KBO']){
 const data=JSON.parse(fs.readFileSync(new URL(`../dist/data/roster_${league.toLowerCase()}.json`,import.meta.url)));
 test(`${league}: official snapshots use unique IDs, Chinese names, legal lineups, balanced 81-game schedules`,()=>{
  assert.equal(data.teams.length,LEAGUES[league].teams);
  assert.equal(new Set(data.players.map(p=>p.id)).size,data.players.length);
  for(const p of data.players){assert.ok(p.id.startsWith(league.toLowerCase()+':'));assert.ok(!/[a-zA-Zァ-ヿ]/.test(p.name),p.name);assert.ok(p.source_url);assert.ok(['npb_stats_2024_2026','estimate_no_npb_stats','cpbl_official_percentiles_2026','estimate_no_cpbl_data','kbo_stats_2024_2025','estimate_no_kbo_stats'].includes(p.ratings_source),p.ratings_source);}
  const s=makeSeason(data,data.teams[0].id,19),homes={},pairs={};
  assert.equal(s.league,league);assert.equal(s.schedule.length,81);
  for(const day of s.schedule){assert.equal(new Set(day.flat()).size,data.teams.length);for(const[a,h]of day){assert.ok(a&&h&&a!==h);homes[h]=(homes[h]||0)+1;const key=[a,h].sort().join('|');pairs[key]=(pairs[key]||0)+1;}}
  assert.ok(Object.values(homes).every(v=>v===40||v===41));assert.ok(Math.max(...Object.values(pairs))-Math.min(...Object.values(pairs))<=1);
  for(const t of data.teams){assert.equal(s.teams[t.id].lineup.length,9);assert.equal(s.teams[t.id].rotation.length,5);assert.ok(assignFielding(s.teams[t.id].lineup,data));}
 });
 test(`${league}: full season, save hydration, next year and trades remain playable`,()=>{
  const base=JSON.stringify(data),s=makeSeason(data,data.teams[0].id,20261115);
  let days=0;
  while(s.phase!=='finished'&&days++<110){if(s.event)resolveEvent(s,data,s.event.choices.length-1);nextDay(s,data);}
  assert.equal(s.phase,'finished');assert.ok(s.champion);for(const t of Object.values(s.teams))assert.equal(t.w+t.l,81);
  const next=advanceSeason(s,data),restored=JSON.parse(JSON.stringify(next)),evolved=seasonData(data,restored);migrateSeason(restored,evolved);
  assert.equal(restored.year,2027);assert.equal(restored.league,league);assert.ok(restored.playerPool.length>=data.players.length);
  nextDay(restored,evolved);assert.equal(restored.day,1);assert.equal(JSON.stringify(data),base);
  // At least one fair deal must work with non-MLB IDs and retain legal rosters.
  const trading=makeSeason(data,data.teams[0].id,31),targetTeam=data.teams[1].id;
  let offer;
  outer:for(const give of rosterFor(trading,data,trading.teamId))for(const get of rosterFor(trading,data,targetTeam)){
   const trial={targetTeam,giveId:give.id,getId:get.id,cash:0};if(evaluateTrade(trading,data,trial).ok){offer=trial;break outer;}
  }
  assert.ok(offer);const totalBefore=data.teams.reduce((n,t)=>n+payroll(trading,data,t.id),0);executeTrade(trading,data,offer);
  assert.equal(data.teams.reduce((n,t)=>n+payroll(trading,data,t.id),0),totalBefore);
  console.log(`${league}: ${data.teams.length} teams, ${data.players.length} players, champion ${s.champion}`);
 });
}
test('invalid small leagues fail explicitly',()=>{assert.throws(()=>makeSchedule(['a','b','c']));assert.throws(()=>makeSchedule(['a','b','c','c']));});
