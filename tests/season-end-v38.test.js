import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSeason,nextDay,userSeasonOver,userLocks,setUserLock,USER_LOCK_MAX,findTradeProposal,rosterFor,tradeCounters,advanceSeason} from '../dist/engine.js?v=41';
import {teamAlive,startPlayoffs,seriesDone,seriesGame,advancePlayoffs} from '../dist/postseason.js?v=41';
const load=l=>JSON.parse(fs.readFileSync(new URL(`../dist/data/roster_${l}.json`,import.meta.url)));

test('teamAlive: unseeded teams and series losers are out; byes and winners stay alive',()=>{
 const ids=load('mlb').teams.map(t=>t.id),po=startPlayoffs('mlb',[...ids].sort());
 const al=po.groups.AL,missed=ids.find(id=>!po.seeds.includes(id));
 assert.equal(teamAlive(po,missed),false);assert.equal(teamAlive(po,al[0]),true,'bye team');
 const x=po.series.find(x=>x.key==='AL-36');while(!seriesDone(x)){x.wins[1]++;x.played++;}
 assert.equal(teamAlive(po,x.teams[0]),false);assert.equal(teamAlive(po,x.teams[1]),true);
 for(const s of po.series)while(!seriesDone(s)){s.wins[0]++;s.played++;}
 advancePlayoffs(po);assert.equal(teamAlive(po,x.teams[0]),false,'loss stays in history');assert.equal(teamAlive(po,al[0]),true);
});

test('once the user club is out, the rest of the postseason runs without club events and ends with a champion',()=>{
 const data=load('cpbl'),s=makeSeason(data,data.teams[0].id,11);
 let guard=0;while(s.phase==='regular'&&guard++<500){nextDay(s,data);s.event=null;}
 assert.equal(s.phase,'playoffs');
 // Make sure the user club is out: pick a team that missed the playoffs.
 s.teamId=data.teams.find(t=>!s.playoffs.seeds.includes(t.id)).id;
 assert.equal(userSeasonOver(s),true);
 guard=0;while(s.phase!=='finished'&&guard++<60){nextDay(s,data);assert.equal(s.event,null,'no club event after elimination');}
 assert.equal(s.phase,'finished');assert.ok(s.champion);assert.equal(userSeasonOver(s),true);
});

test('user not-for-sale players: max 3, only own roster, skipped by AI proposals and counters, carried to next season',()=>{
 const data=load('cpbl'),s=makeSeason(data,data.teams[0].id,5),mine=rosterFor(s,data,s.teamId);
 assert.equal(setUserLock(s,data,rosterFor(s,data,data.teams[1].id)[0].id,true).ok,false);
 for(const p of mine.slice(0,USER_LOCK_MAX))assert.ok(setUserLock(s,data,p.id,true).ok);
 assert.equal(setUserLock(s,data,mine[USER_LOCK_MAX].id,true).ok,false);
 assert.deepEqual(userLocks(s,data),mine.slice(0,USER_LOCK_MAX).map(p=>p.id));
 assert.ok(setUserLock(s,data,mine[0].id,false).ok);assert.equal(userLocks(s,data).length,USER_LOCK_MAX-1);
 // Lock the players AI clubs want most, then check no proposal asks for them.
 const locks=new Set();for(let k=0;k<40;k++){const o=findTradeProposal(s,data,s.teamId,data.teams[1+k%(data.teams.length-1)].id);if(o)locks.add(o.giveId);}
 s.userUntouchables=[...locks].slice(0,USER_LOCK_MAX);
 for(let k=0;k<60;k++){const o=findTradeProposal(s,data,s.teamId,data.teams[1+k%(data.teams.length-1)].id);if(o)assert.ok(!s.userUntouchables.includes(o.giveId));}
 const target=data.teams[1].id,want=rosterFor(s,data,target).sort((a,b)=>b.ratings.contact-a.ratings.contact)[0];
 for(const c of tradeCounters(s,data,{targetTeam:target,give:[],get:[want.id],cash:0}))assert.ok(c.offer.give.every(id=>!s.userUntouchables.includes(id)));
 const keep=[...s.userUntouchables];let guard=0;while(s.phase!=='finished'&&guard++<500){nextDay(s,data);s.event=null;}
 const next=advanceSeason(s,data,data);assert.deepEqual(next.userUntouchables,keep);
});
