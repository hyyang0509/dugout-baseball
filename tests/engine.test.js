import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSchedule,makeSeason,nextDay,resolveEvent,simulateGame,standings,autoLineup} from '../dist/engine.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/data/roster_mlb.json',import.meta.url)));

test('81-game schedule has one match daily, balanced home/away and each pair 2 or 3 times',()=>{
 const schedule=makeSchedule(data.teams.map(t=>t.id));assert.equal(schedule.length,81);
 const pairs={},homes={},aways={};for(const day of schedule){assert.equal(day.length,15);const ids=day.flat();assert.equal(new Set(ids).size,30);
  for(const[a,h]of day){assert.notEqual(a,h);const k=[a,h].sort().join('|');pairs[k]=(pairs[k]||0)+1;homes[h]=(homes[h]||0)+1;aways[a]=(aways[a]||0)+1;}}
 assert.ok(Object.values(pairs).every(n=>n===2||n===3));assert.ok(Object.values(homes).every(n=>n===40||n===41));assert.ok(Object.values(aways).every(n=>n===40||n===41));
});
test('all teams have 9 unique hitters and a viable rotation',()=>{const s=makeSeason(data,'mlb:119',123);for(const t of data.teams){assert.equal(s.teams[t.id].lineup.length,9);assert.equal(new Set(s.teams[t.id].lineup).size,9);assert.equal(s.teams[t.id].rotation.length,5);}});
test('deterministic single game keeps runs/hits/outs coherent',()=>{
 const a=makeSeason(data,'mlb:119',321),b=structuredClone(a);const g=simulateGame(a,data,'mlb:147','mlb:119');const other=simulateGame(b,data,'mlb:147','mlb:119');assert.deepEqual(g,other);assert.notEqual(g.score[0],g.score[1]);
 for(let side=0;side<2;side++){
  const id=side?g.home:g.away;const bats=g.batters.filter(b=>data.players.find(p=>p.id===b.id).team_id===id);
  assert.equal(g.score[side],g.innings[side].reduce((a,b)=>a+(b||0),0));assert.equal(g.hits[side],bats.reduce((a,b)=>a+b.h,0));assert.equal(g.score[side],bats.reduce((a,b)=>a+b.r,0));
  const opposition=side?g.away:g.home;const arms=g.pitchers.filter(p=>data.players.find(q=>q.id===p.id).team_id===opposition);assert.equal(arms.reduce((a,b)=>a+b.r,0),g.score[side]);
 }
 for(const b of g.batters){assert.ok(b.ab>=b.h);assert.ok(b.h>=b.hr);}
});
test('injured player replaced and event pauses until resolved',()=>{const s=makeSeason(data,'mlb:119',123);const injured=s.teams[s.teamId].lineup[0];s.condition[injured].injury=5;s.event={type:'training',player:injured,title:'test',text:'test',choices:['train','rest']};assert.deepEqual(nextDay(s,data),[]);assert.equal(s.day,0);resolveEvent(s,data,Math.min(1,s.event.choices.length-1));nextDay(s,data);assert.ok(!s.lastGame.lineups.flat().includes(injured));assert.equal(s.condition[injured].injury,4);});
test('full season reaches champion, records balance, save roundtrip remains playable',()=>{
 const s=makeSeason(data,'mlb:119',12345);let days=0;const start=Date.now();
 while(s.phase!=='finished'&&days<100){if(s.event)resolveEvent(s,data,Math.min(1,s.event.choices.length-1));nextDay(s,data);days++;}
 assert.equal(s.phase,'finished');assert.ok(data.teams.some(t=>t.id===s.champion));assert.ok(days>=86&&days<=89);assert.ok(Object.values(s.teams).every(t=>t.w+t.l===81));assert.equal(Object.values(s.teams).reduce((a,t)=>a+t.w,0),1215);assert.equal(Object.values(s.teams).reduce((a,t)=>a+t.rs,0),Object.values(s.teams).reduce((a,t)=>a+t.ra,0));
 for(const c of Object.values(s.condition)){assert.ok(c.energy>=0&&c.energy<=100);assert.ok(c.injury>=0);}
 const serialized=JSON.stringify(s);assert.ok(serialized.length<4000000);assert.deepEqual(JSON.parse(serialized).teams,s.teams);
 console.log(JSON.stringify({seasonDays:days,champion:s.champion,totalRuns:Object.values(s.teams).reduce((a,t)=>a+t.rs,0),saveKB:Math.round(serialized.length/1024),elapsedMs:Date.now()-start}));
});
test('two-way star can start at DH without losing pitcher availability',()=>{const s=makeSeason(data,'mlb:119',55);const ohtani=data.players.find(p=>p.name==='Shohei Ohtani');assert.ok(s.teams['mlb:119'].lineup.includes(ohtani.id));assert.ok(s.teams['mlb:119'].rotation.includes(ohtani.id));});
