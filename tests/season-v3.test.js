import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSeason,migrateSeason,makeSchedule,autoLineup,simulateGame,nextDay,resolveEvent,makeEvent,findTradeProposal,teamOf,rosterFor,remainingSalary,payroll,dailySalary,tradeDeadline,EVENT_RATE} from '../dist/engine.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/data/roster_mlb.json',import.meta.url)));
const fresh=(seed=12345)=>makeSeason(data,'mlb:119',seed);

test('each game rebuilds both lineups from current health, form and energy',()=>{
 const s=fresh();const ids=['mlb:119','mlb:147'];
 for(const id of ids){s.teams[id].lineup.reverse();s.teams[id].fielding={};const star=rosterFor(s,data,id).find(p=>p.ratings.contact!=null);s.condition[star.id].energy=25;s.condition[star.id].form=-1;}
 const expected=ids.map(id=>autoLineup(rosterFor(s,data,id),s.condition));
 const game=simulateGame(s,data,...ids);assert.deepEqual(game.lineups,expected);
});
test('multi-day simulation optimizes the full league on every successive date',()=>{
 const s=fresh(721);for(let date=0;date<7;date++){
  if(s.event)resolveEvent(s,data,Math.min(1,s.event.choices.length-1));
  // Damage the prior lineup to ensure the next date rebuilds it, rather than reusing it.
  for(const club of Object.values(s.teams)){club.lineup=Array(9).fill('invalid');club.fielding={};}
  const games=nextDay(s,data);assert.equal(games.length,15);
  for(const g of games)for(let side=0;side<2;side++){const team=side===0?g.away:g.home;assert.equal(new Set(g.lineups[side]).size,9);assert.ok(g.lineups[side].every(id=>rosterFor(s,data,team).some(p=>p.id===id)));assert.equal(new Set(Object.values(s.teams[team].fielding)).size,9);}
 }
 assert.equal(s.day,7);
});
test('58-game regular-season save extends without changing prior games or remaining salary',()=>{
 const s=fresh();s.version=2;s.schedule=s.schedule.slice(0,58);delete s.salaryPlan;s.day=20;s.batting.test={h:9};s.tradeLog=[{day:3,giveId:'a',getId:'b'}];
 const originalSchedule=structuredClone(s.schedule),finance=structuredClone(s.finance),rng=s.rng;const remaining=Math.ceil(payroll(s,data,s.teamId)*38/58);
 migrateSeason(s,data);assert.equal(s.schedule.length,81);assert.deepEqual(s.schedule.slice(0,58),originalSchedule);assert.deepEqual(s.finance,finance);assert.equal(s.day,20);assert.equal(s.rng,rng);assert.equal(s.batting.test.h,9);assert.equal(remainingSalary(s,data,s.teamId),remaining);assert.equal(dailySalary(s,data,s.teamId),Math.round(payroll(s,data,s.teamId)*(38/58)/61));
 const snapshot=JSON.stringify(s);migrateSeason(s,data);assert.equal(JSON.stringify(s),snapshot);
});
test('58-game playoff saves retain their bracket and finished saves retain champion',()=>{for(const phase of ['playoffs','finished']){const s=fresh();s.schedule=s.schedule.slice(0,58);delete s.salaryPlan;s.day=60;s.phase=phase;s.playoffs={round:'final',series:[{teams:['mlb:119','mlb:147'],wins:[2,0]}],game:2};s.champion=phase==='finished'?'mlb:119':null;const bracket=JSON.stringify(s.playoffs);migrateSeason(s,data);assert.equal(s.schedule.length,58);assert.equal(s.phase,phase);assert.equal(JSON.stringify(s.playoffs),bracket);assert.equal(remainingSalary(s,data,s.teamId),0);}});
test('new deadline scales to 61 days in the 81-game season',()=>{assert.equal(tradeDeadline(fresh()),61);});
test('legacy clubhouse decisions remain resolvable',()=>{const s=fresh();s.event={type:'clubhouse',player:s.teams[s.teamId].lineup[0],title:'更衣室：舊版事件',text:'舊版存檔',choices:['全隊會議','個別溝通']};const before=s.teams[s.teamId].morale;resolveEvent(s,data,0);assert.equal(s.teams[s.teamId].morale,before+12);assert.ok(rosterFor(s,data,s.teamId).every(p=>s.condition[p.id].energy===96));assert.equal(s.event,null);});
test('random trade proposals remain pending until accepted or rejected',()=>{
 for(const accept of [false,true]){const s=fresh(31);makeEvent(s,data,'trade_offer');assert.equal(s.event.type,'trade_offer');const offer=structuredClone(s.event.offer),cash=s.finance[s.teamId].cash;
  assert.equal(teamOf(s,data.players.find(p=>p.id===offer.getId)),offer.targetTeam);assert.equal(s.tradeLog.length,0);resolveEvent(s,data,accept?0:1);
  assert.equal(s.finance[s.teamId].cash,cash-(accept?offer.cash:0));assert.equal(teamOf(s,data.players.find(p=>p.id===offer.getId)),accept?s.teamId:offer.targetTeam);assert.equal(s.tradeLog.length,accept?1:0);
 }
});
test('AI league trade updates other rosters and preserves user roster and cash',()=>{const s=fresh(99);const own=rosterFor(s,data,s.teamId).map(p=>p.id),cash=s.finance[s.teamId].cash;makeEvent(s,data,'league_trade');assert.equal(s.event.type,'league_trade');assert.equal(s.tradeLog.length,1);assert.notEqual(s.tradeLog[0].fromTeam,s.teamId);assert.notEqual(s.tradeLog[0].targetTeam,s.teamId);assert.deepEqual(rosterFor(s,data,s.teamId).map(p=>p.id),own);assert.equal(s.finance[s.teamId].cash,cash);resolveEvent(s,data,0);assert.equal(s.event,null);});
test('stale pending trades fail safely and can still be declined',()=>{const s=fresh(31);makeEvent(s,data,'trade_offer');const get=s.event.offer.getId;s.condition[get].injury=2;const snapshot=JSON.stringify(s);assert.throws(()=>resolveEvent(s,data,0));assert.equal(JSON.stringify(s),snapshot);resolveEvent(s,data,1);assert.equal(s.event,null);});
test('event generation is more frequent with varied types and limited injury share',()=>{assert.equal(EVENT_RATE,.4);const s=fresh(44);const counts={};for(let i=0;i<150;i++){makeEvent(s,data);counts[s.event.type]=(counts[s.event.type]||0)+1;resolveEvent(s,data,Math.min(1,s.event.choices.length-1));}assert.ok(counts.clubhouse>20);assert.ok(counts.trade_offer>10);assert.ok(counts.league_trade>0);assert.ok(counts.injury<30);console.log('Event sample',counts);});
