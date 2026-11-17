import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSeason,nextDay,resolveEvent,playerAge} from '../dist/engine.js';
const load=l=>JSON.parse(fs.readFileSync(new URL(`../dist/data/roster_${l}.json`,import.meta.url)));
const pct=(xs,q)=>{xs=[...xs].sort((a,b)=>a-b);return xs[Math.floor((xs.length-1)*q)];};

for(const league of ['npb','cpbl']){
 const data=load(league);
 test(`${league}: ratings come from stats for most players and are spread on the MLB-like scale`,()=>{
  const fromStats=data.players.filter(p=>!String(p.ratings_source).startsWith('estimate')).length;
  assert.ok(fromStats/data.players.length>0.5,`${fromStats}/${data.players.length} rated from stats`);
  const hitters=data.players.filter(p=>p.position!=='P');
  for(const key of ['contact','power','eye']){
   const xs=hitters.map(p=>p.ratings[key]);
   assert.ok(pct(xs,.9)-pct(xs,.1)>=10,`${key} spread`);assert.ok(Math.max(...xs)>=62,`${key} has stars`);
   assert.ok(xs.every(x=>Number.isInteger(x)&&x>=25&&x<=80));
  }
  const pitchers=data.players.filter(p=>p.position==='P');
  for(const key of ['stuff','control','movement'])assert.ok(pct(pitchers.map(p=>p.ratings[key]),.9)-pct(pitchers.map(p=>p.ratings[key]),.1)>=10,`${key} spread`);
 });
 test(`${league}: every club has exactly five starters with starter stamina`,()=>{
  for(const t of data.teams){const ps=data.players.filter(p=>p.team_id===t.id&&p.position==='P');
   assert.equal(ps.filter(p=>p.role==='SP').length,5);
   for(const p of ps)assert.equal(p.ratings.stamina,p.role==='SP'?75:30);}
 });
 test(`${league}: ages are real birth dates with a realistic spread`,()=>{
  const ages=data.players.filter(p=>p.birth_date).map(p=>playerAge({year:2026},p));
  assert.ok(ages.length/data.players.length>0.95,`birth dates ${ages.length}/${data.players.length}`);
  assert.ok(pct(ages,.1)<=23&&pct(ages,.9)>=31,`age spread ${pct(ages,.1)}-${pct(ages,.9)}`);
 });
 test(`${league}: a season still plays with the new ratings`,()=>{
  const s=makeSeason(data,data.teams[0].id,777);
  for(let i=0;i<15;i++){if(s.event)resolveEvent(s,data,s.event.choices.length-1);nextDay(s,data);}
  assert.ok(s.day>=15);
 });
}
