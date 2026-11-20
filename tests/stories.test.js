import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSeason,makeEvent,makeStory,resolveEvent,nextDay,rosterFor,playerTraits,STORIES,TRAIT_LABELS,eventChoiceStatus} from '../dist/engine.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/data/roster_mlb.json',import.meta.url)));
const fresh=(seed=2024)=>makeSeason(data,'mlb:119',seed);

test('traits are deterministic, labelled, and age-aware',()=>{
 const s=fresh(),roster=rosterFor(s,data,s.teamId);
 for(const p of roster){const a=playerTraits(s,p),b=playerTraits(s,p);assert.deepEqual(a,b);assert.ok(a.length>=1);for(const t of a)assert.ok(TRAIT_LABELS[t],t);}
 const young=roster.find(p=>p.birth_date&&2026-Number(p.birth_date.slice(0,4))<=23);if(young)assert.ok(playerTraits(s,young).includes('rookie'));
 const old=roster.find(p=>p.birth_date&&2026-Number(p.birth_date.slice(0,4))>=34);if(old)assert.ok(playerTraits(s,old).includes('veteran'));
});

test('every story template builds with real players and every choice resolves cleanly',()=>{
 const roster=rosterFor(fresh(),data,'mlb:119'),hit=roster.filter(p=>p.ratings.contact!=null),pit=roster.filter(p=>p.ratings.stuff!=null);
 for(const tpl of STORIES){
  const probe=makeStory(fresh(),data,tpl.id,{p:hit[0],q:pit[0]});
  assert.ok(probe,`${tpl.id} builds`);
  for(let i=0;i<probe.choices.length;i++){
   const s=fresh(),e=makeStory(s,data,tpl.id,{p:hit[0],q:pit[0]});s.event=e;
   assert.ok(e.title&&e.text&&e.options[i].description,`${tpl.id} text`);
   if(!eventChoiceStatus(s,data,e,i).ok)continue;
   const cash=s.finance[s.teamId].cash;resolveEvent(s,data,i);assert.equal(s.event,null);
   const o=e.options[i];assert.equal(s.finance[s.teamId].cash,cash-o.cost+o.income,`${tpl.id} cash`);
  }
 }
 assert.ok(STORIES.length>=40,`${STORIES.length} templates`);
});

test('the deck draws a wide variety of stories and legendary ones stay rare',()=>{
 const s=fresh(7),seen={},rarity={};
 for(let i=0;i<400;i++){s.day=i%80;makeEvent(s,data,'story');const e=s.event;if(e.story){seen[e.story]=(seen[e.story]||0)+1;rarity[e.rarity]=(rarity[e.rarity]||0)+1;}resolveEvent(s,data,e.choices.length-1);}
 assert.ok(Object.keys(seen).length>=20,`distinct ${Object.keys(seen).length}`);
 assert.ok((rarity.legendary||0)<(rarity.common||0)/8,JSON.stringify(rarity));
});

test('a follow-up chain fires on schedule with the same players',()=>{
 const s=fresh(11),roster=rosterFor(s,data,s.teamId),mentor=roster[0],rookie=roster[1];
 s.event=makeStory(s,data,'mentor_pair',{p:mentor,q:rookie});resolveEvent(s,data,0);
 assert.equal(s.storyQueue.length,1);const due=s.storyQueue[0].day;
 let found=null;for(let i=0;i<20&&!found;i++){nextDay(s,data);if(s.event?.story==='rookie_breakthrough')found=s.event;else if(s.event)resolveEvent(s,data,s.event.choices.length-1);}
 assert.ok(found,'follow-up appeared');assert.ok(s.day>=due);assert.deepEqual(found.participants,[mentor.id,rookie.id]);assert.ok(found.chain);
});

test('a full season with the story deck plays through and finances reconcile',()=>{
 const s=fresh(5);const f=s.finance[s.teamId],opening=f.cash;
 while(s.phase!=='finished'){if(s.event){const ok=s.event.choices.map((_,i)=>i).filter(i=>eventChoiceStatus(s,data,s.event,i).ok);resolveEvent(s,data,ok[0]??0);}nextDay(s,data);}
 assert.equal(f.cash,opening+f.income-f.salaryCost-f.operatingCost+f.tradeCash);
});

test('v2.7 deck: 120+ stories, league-only stories stay in their league, cooldowns hold',()=>{
 assert.ok(STORIES.length>=120,`${STORIES.length}`);
 const s=fresh(21),seen={};let league=0;
 for(let i=0;i<300;i++){s.day=i%80;makeEvent(s,data,'story');const e=s.event;
  if(e.story){const tpl=STORIES.find(t=>t.id===e.story);if(tpl.leagues){league++;assert.ok(tpl.leagues.includes('MLB'),e.story);}
   if(!e.chain&&seen[e.story]!=null&&seen[e.story]<=s.day)assert.ok(s.day-seen[e.story]>=20,`${e.story} repeated after ${s.day-seen[e.story]} days`);seen[e.story]=s.day;}
  resolveEvent(s,data,e.choices.length-1);if(s.day===79)Object.keys(seen).forEach(k=>delete seen[k]);}
 for(const t of STORIES.filter(t=>t.leagues))assert.ok(t.leagues.every(l=>['MLB','NPB','KBO','CPBL'].includes(l)),t.id);
 for(const id of ['CPBL','KBO','NPB'])assert.ok(STORIES.some(t=>t.leagues?.includes(id)),id);
});
