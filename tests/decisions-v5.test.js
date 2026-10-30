import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSeason,makeStoryEvent,STORY_SCENARIOS,resolveEvent,eventChoiceStatus,rosterFor,migrateSeason,nextDay} from '../dist/engine.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/data/roster_mlb.json',import.meta.url)));
const fresh=()=>makeSeason(data,'mlb:119',821);
test('eight clubhouse scenarios have unique actions with three distinct real outcomes',()=>{
 const sets=new Set();for(const scenario of STORY_SCENARIOS.clubhouse){
  const base=fresh(),e=makeStoryEvent(base,data,base.teamId,'clubhouse',scenario);assert.equal(e.options.length,3);assert.equal(new Set(e.choices).size,3);sets.add(e.choices.join('|'));const outcomes=new Set();
  for(let i=0;i<3;i++){const s=structuredClone(base);s.event=structuredClone(e);for(const c of Object.values(s.condition))c.energy=60;const o=e.options[i],cash=s.finance[s.teamId].cash,cost=s.finance[s.teamId].operatingCost;resolveEvent(s,data,i);
   assert.equal(s.teams[s.teamId].morale,50+o.morale);assert.equal(s.finance[s.teamId].cash,cash-o.cost);assert.equal(s.finance[s.teamId].operatingCost,cost+o.cost);for(const p of rosterFor(s,data,s.teamId)){const x=o.players.find(x=>x.id===p.id);assert.equal(s.condition[p.id].energy,60+o.teamEnergy+(x?.energy||0));if(x?.form){assert.equal(s.condition[p.id].form,x.form);assert.equal(s.condition[p.id].formDays,x.days+1);}}
   assert.match(s.news[0].text,/氣氛/);assert.equal(s.event,null);outcomes.add(JSON.stringify([s.teams[s.teamId].morale,s.condition,s.finance[s.teamId].cash]));
  }assert.equal(outcomes.size,3);
 }assert.equal(sets.size,8);
});
test('paid clubhouse choice is affordable only after reserving salary, failure is atomic',()=>{const s=fresh();s.event=makeStoryEvent(s,data,s.teamId,'clubhouse','welcome');s.finance[s.teamId].cash=1;assert.equal(eventChoiceStatus(s,data,s.event,0).ok,false);const before=JSON.stringify(s);assert.throws(()=>resolveEvent(s,data,0),/現金不足/);assert.equal(JSON.stringify(s),before);resolveEvent(s,data,2);assert.equal(s.event,null);});
test('AI clubhouse decision applies only to its own team and preserves financial ledger',()=>{const s=fresh(),other=data.teams.find(t=>t.id!==s.teamId).id;const own=JSON.stringify(rosterFor(s,data,s.teamId).map(p=>s.condition[p.id]));s.event=makeStoryEvent(s,data,other,'clubhouse','welcome');const f=s.finance[other],cash=f.cash;resolveEvent(s,data,0);assert.equal(f.cash,cash-60000);assert.equal(f.operatingCost,60000);assert.equal(f.ledger[0].net,-60000);assert.equal(JSON.stringify(rosterFor(s,data,s.teamId).map(p=>s.condition[p.id])),own);assert.equal(s.teams[s.teamId].morale,50);});
test('pending old authored scenario gains choices once without consuming RNG or effects',()=>{const s=fresh();s.event=makeStoryEvent(s,data,s.teamId,'clubhouse','coach');delete s.event.options;s.event.choices=['全隊會議','個別溝通'];const rng=s.rng,cash=s.finance[s.teamId].cash;migrateSeason(s,data);assert.equal(s.event.choices.length,3);assert.equal(s.rng,rng);assert.equal(s.finance[s.teamId].cash,cash);const copy=JSON.stringify(s);migrateSeason(s,data);assert.equal(JSON.stringify(s),copy);});
test('one-day cold penalty lasts through the next game rather than disappearing before it',()=>{const s=fresh();s.event=makeStoryEvent(s,data,s.teamId,'clubhouse','music');const id=s.event.player;resolveEvent(s,data,0);assert.equal(s.condition[id].formDays,2);nextDay(s,data);assert.equal(s.condition[id].form,-1);assert.equal(s.condition[id].formDays,1);});
