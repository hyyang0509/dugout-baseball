import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSeason,nextDay,resolveEvent,rosterFor,teamOf,hasBat,hasPitch,ovr,evaluateTrade,releaseCheck,releasePlayer,assignFielding,advanceSeason,importCount,FOREIGN_LIMIT,untouchables,makeStoryEvent,STORY_SCENARIOS} from '../dist/engine.js';
import {boardOf,boardStatus,reviewSeason,jobOffers,takeJob,gmOf,refreshTitles,managerOf,managerCandidates,managerFee,hireManager,setSelfManaged,fansOf,ensureFront,gmMarkup} from '../dist/front.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/data/roster_cpbl.json',import.meta.url)));
const fresh=(seed=31)=>{const s=makeSeason(data,data.teams[0].id,seed);ensureFront(s,data);return s;};
const play=(s,days)=>{for(let i=0;i<days&&s.phase!=='finished';i++){if(s.event)resolveEvent(s,data,s.event.choices.length-1);nextDay(s,data);}};

test('every club gets three weighted board goals that add up to 100',()=>{
 for(const t of data.teams){const s=makeSeason(data,t.id,5);const b=boardOf(s,data);assert.equal(b.goals.length,3);assert.equal(b.goals.reduce((a,g)=>a+g.weight,0),100);assert.ok(b.confidence===60);}
 const kinds=new Set(data.teams.flatMap(t=>boardOf(makeSeason(data,t.id,5),data).goals.map(g=>g.type)));
 assert.ok(kinds.size>=4,[...kinds].join());
});

test('a full season: fans talk, the board reviews once, and the record carries into next season',()=>{
 const s=fresh();play(s,400);
 assert.equal(s.phase,'finished');
 const f=fansOf(s);assert.ok(f.posts.length>5);assert.ok(f.sentiment>=0&&f.sentiment<=100);
 assert.ok(f.posts.some(p=>p.kind==='pundit'));
 const r=s.board.result;assert.ok(r&&typeof r.grade==='number');
 assert.equal(gmOf(s).career.seasons,1);
 assert.equal(reviewSeason(s,data),r,'review happens once');
 if(!r.fired){const next=advanceSeason(s,data);ensureFront(next,data);assert.equal(next.board.year,next.year);assert.equal(next.board.confidence,r.confidence);assert.equal(next.gm.history.length,1);assert.equal(next.manager.name,s.manager.name);}
});

test('a bad review fires the GM; weaker clubs offer jobs and the GM moves',()=>{
 const s=fresh();play(s,400);
 s.board.result=null;s.board.confidence=10;
 for(const g of s.board.goals)if(g.type==='wins')g.target=999;
 const r=reviewSeason(s,data);assert.ok(r.fired);
 const offers=jobOffers(s,data);assert.ok(offers.length>=1&&!offers.some(o=>o.id===s.teamId));
 const w={teamId:s.teamId};takeJob(w,s,data,offers[0].id);
 assert.equal(s.teamId,offers[0].id);assert.equal(w.teamId,offers[0].id);assert.equal(s.board.teamId,offers[0].id);
 assert.throws(()=>takeJob(w,s,data,'nope'));
});

test('releasing pays the rest of the salary, frees the roster spot and keeps the lineup legal',()=>{
 const s=fresh();play(s,5);
 const bench=rosterFor(s,data,s.teamId).filter(p=>!s.teams[s.teamId].lineup.includes(p.id)&&hasBat(p)&&!hasPitch(p))[0];
 const before=s.finance[s.teamId].cash,c=releaseCheck(s,data,bench.id);assert.ok(c.ok,c.reasons.join());
 releasePlayer(s,data,bench.id);
 assert.equal(teamOf(s,bench),'FA');assert.equal(s.finance[s.teamId].cash,before-c.owed);
 assert.equal(s.finance[s.teamId].ledger[0].type,'release');
 assert.equal(gmOf(s).season.releases,1);
 assert.ok(assignFielding(s.teams[s.teamId].lineup,data));
 // Cannot strip the roster below the minimum.
 let stopped=null;for(const p of rosterFor(s,data,s.teamId)){const r=releaseCheck(s,data,p.id);if(!r.ok){stopped=r;break;}releasePlayer(s,data,p.id);}
 assert.ok(stopped&&rosterFor(s,data,s.teamId).length>=26);
 play(s,2);
});

test('imports: trades cannot push a club over its foreign-player limit',()=>{
 const s=fresh();s.league='NPB';
 const other=data.teams[1].id,mine=rosterFor(s,data,s.teamId),theirs=rosterFor(s,data,other).filter(p=>!untouchables(s,data,other).includes(p.id));
 for(const p of data.players)p.origin='JPN';
 try{
  mine.slice(0,FOREIGN_LIMIT.NPB).forEach(p=>{p.origin='INTL';});
  const target=theirs.sort((a,b)=>ovr(a)-ovr(b))[0];target.origin='INTL';
  const give=mine.filter(p=>p.origin==='JPN').sort((a,b)=>ovr(b)-ovr(a))[0];
  assert.equal(importCount(mine,'NPB'),FOREIGN_LIMIT.NPB);
  const r=evaluateTrade(s,data,{targetTeam:other,give:[give.id],get:[target.id],cash:0});
  assert.ok(r.reasons.some(x=>/洋將/.test(x)),r.reasons.join());
  const swap=mine.find(p=>p.origin==='INTL'&&hasPitch(p)===hasPitch(target)&&!s.condition[p.id].injury)||mine.find(p=>p.origin==='INTL');
  const r2=evaluateTrade(s,data,{targetTeam:other,give:[swap.id],get:[target.id],cash:0});
  assert.ok(!r2.reasons.some(x=>/洋將/.test(x)),'import for import is fine');
 }finally{for(const p of data.players)delete p.origin;}
});

test('manager: style sets the pitch limit, hiring charges buyout plus fee, and the GM can take the lineup',()=>{
 const s=fresh(),m=managerOf(s);
 assert.ok(s.teams[s.teamId].starterLimit>=75);
 const c=managerCandidates(s)[0],cost=managerFee(s,c)+Math.round(managerFee(s,m)*.5/10000)*10000,cash=s.finance[s.teamId].cash;
 assert.ok(hireManager(s,data,c.id).ok);
 assert.equal(s.finance[s.teamId].cash,cash-cost);assert.equal(managerOf(s).name,c.name);
 assert.equal(gmOf(s).season.managerFires,1);
 setSelfManaged(s,data,true);assert.equal(s.manualLineup,true);
 setSelfManaged(s,data,false);assert.equal(s.manualLineup,false);assert.equal(s.teams[s.teamId].lineup.length,9);
});

test('titles change with behaviour and carry real effects',()=>{
 const s=fresh();play(s,3);
 const g=gmOf(s);g.season.managerFires=2;refreshTitles(s,data);
 assert.ok(g.titles.some(t=>t.id==='tyrant'));
 g.season.trades=3;g.season.tradeGain=2;g.season.tradeCashOut=0;refreshTitles(s,data);
 assert.ok(g.titles.some(t=>t.id==='genius'));
 assert.ok(gmMarkup(s)>1);
 assert.ok(s.news.some(n=>/GM 新評價/.test(n.title)));
});

test('off-field stories use roster players and never allege crimes',()=>{
 for(const scenario of STORY_SCENARIOS.offfield){
  const s=fresh(),e=makeStoryEvent(s,data,s.teamId,'offfield',scenario);
  assert.equal(e.participants.length,1);
  assert.ok(e.text.includes(data.players.find(p=>p.id===e.participants[0]).name));
  assert.doesNotMatch(e.title+e.text,/酒駕|暴力|毒品|逮捕|犯罪/);
  assert.equal(e.options.length,3);
  s.event=e;resolveEvent(s,data,0);assert.equal(s.event,null);
 }
});
