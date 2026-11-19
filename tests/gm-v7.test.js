import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSeason,nextDay,rosterFor,teamOf,hasBat,hasPitch,ovr,evaluateTrade,executeTrade,tradeCounters,packageValue,normOffer,untouchables,payroll,advanceSeason} from '../dist/engine.js';
import {teamReport,leagueProfiles,tradeImpact,assistantOf,assistantVerdict,assistantReport,assistantCandidates,assistantFee,hireAssistant,CATEGORIES} from '../dist/gm.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/data/roster_cpbl.json',import.meta.url)));
const fresh=(seed=21)=>{const s=makeSeason(data,data.teams[0].id,seed);s.aiOnly=true;for(let i=0;i<8;i++){s.event=null;nextDay(s,data);}s.event=null;return s;};
const healthy=(s,team)=>rosterFor(s,data,team).filter(p=>!s.condition[p.id].injury&&!untouchables(s,data,team).includes(p.id));

test('league profiles rank every category from 1 to n; the report names strengths and weaknesses',()=>{
 const s=fresh(),rows=leagueProfiles(s,data),n=data.teams.length;
 for(const c of CATEGORIES){const ranks=rows.map(r=>r.ranks[c.key]).sort((a,b)=>a-b);assert.deepEqual(ranks,Array.from({length:n},(_,i)=>i+1),c.key);}
 const rep=teamReport(s,data,s.teamId);
 assert.equal(rep.strengths.length,2);assert.equal(rep.weaknesses.length,2);
 assert.ok(rep.strengths[0].rank<=rep.weaknesses[0].rank);
});

test('trade impact: sending away the best hitter weakens offense; nothing changes on the real roster',()=>{
 const s=fresh(),other=data.teams[1].id,before=JSON.stringify(s.ownership);
 const star=rosterFor(s,data,s.teamId).filter(hasBat).sort((a,b)=>ovr(b)-ovr(a))[0];
 const scrub=rosterFor(s,data,other).filter(p=>hasPitch(p)&&!hasBat(p)).sort((a,b)=>ovr(a)-ovr(b))[0];
 const im=tradeImpact(s,data,{targetTeam:other,give:[star.id],get:[scrub.id]});
 assert.ok(im.cats.find(c=>c.key==='offense').after<im.cats.find(c=>c.key==='offense').before);
 assert.ok(im.delta<0);
 assert.equal(JSON.stringify(s.ownership),before);
});

test('packages: one star is worth more than the same total spread over three players',()=>{
 assert.ok(packageValue([60])>packageValue([20,20,20]));
 assert.equal(packageValue([10,30]),30+10*.55);
 const o=normOffer({targetTeam:'x',giveId:'a',getId:'b',cash:5});
 assert.deepEqual([o.give,o.get,o.cash],[['a'],['b'],5]);
});

test('multi-player trades move everyone, and the other club can pay cash',()=>{
 const s=fresh(),my=s.teamId;let done=null;
 for(const t of data.teams.filter(t=>t.id!==my)){
  const mine=healthy(s,my).sort((a,b)=>ovr(b)-ovr(a)),theirs=healthy(s,t.id).sort((a,b)=>ovr(a)-ovr(b));
  const draft={targetTeam:t.id,give:[mine[0].id],get:[theirs[0].id,theirs[1].id],cash:0};
  const r=evaluateTrade(s,data,draft);
  if(!r.ok||r.neededCash>=0)continue;
  // They value our player enough to pay; ask for part of it.
  const cash=Math.max(r.neededCash,-Math.floor(s.finance[t.id].cash/20/10000)*10000);
  const withCash={...draft,cash:Math.ceil(cash/10000)*10000};
  if(!evaluateTrade(s,data,withCash).ok)continue;
  const mineBefore=s.finance[my].cash,theirsBefore=s.finance[t.id].cash;
  executeTrade(s,data,withCash);done={t:t.id,draft:withCash,mineBefore,theirsBefore};break;
 }
 assert.ok(done,'found a 1-for-2 trade with cash coming back');
 const {draft}=done;
 for(const id of draft.give)assert.equal(teamOf(s,data.players.find(p=>p.id===id)),done.t);
 for(const id of draft.get)assert.equal(teamOf(s,data.players.find(p=>p.id===id)),s.teamId);
 assert.equal(s.finance[s.teamId].cash,done.mineBefore-draft.cash);
 assert.equal(s.finance[done.t].cash,done.theirsBefore+draft.cash);
 assert.ok(draft.cash<0);
 assert.deepEqual(s.tradeLog[0].get,draft.get);
 assert.equal(s.teams[s.teamId].lineup.length,9);
});

test('cash and roster limits are enforced; counters for multi-player drafts are acceptable',()=>{
 const s=fresh(),other=data.teams[2].id;
 const mine=healthy(s,s.teamId).sort((a,b)=>ovr(a)-ovr(b)),theirs=healthy(s,other).sort((a,b)=>ovr(b)-ovr(a));
 assert.equal(evaluateTrade(s,data,{targetTeam:other,give:[mine[0].id],get:[theirs[0].id],cash:12345}).ok,false);
 assert.equal(evaluateTrade(s,data,{targetTeam:other,give:mine.slice(0,4).map(p=>p.id),get:[theirs[0].id]}).ok,false);
 let checked=0;
 for(const t of data.teams.filter(t=>t.id!==s.teamId)){
  const best=healthy(s,t.id).sort((a,b)=>ovr(b)-ovr(a));
  const draft={targetTeam:t.id,give:[mine[0].id],get:[best[0].id,best[3].id],cash:0};
  if(evaluateTrade(s,data,draft).ok)continue;
  for(const c of tradeCounters(s,data,draft)){assert.ok(evaluateTrade(s,data,c.offer).ok,c.label);checked++;}
 }
 assert.ok(checked>=2,`counters checked: ${checked}`);
});

test('assistant: a stable verdict with reasons, a dashboard briefing, and paid hiring that carries into next season',()=>{
 const s=fresh(),a=assistantOf(s),other=data.teams[1].id;
 const offer={targetTeam:other,give:[healthy(s,s.teamId)[3].id],get:[healthy(s,other)[3].id],cash:0};
 const v1=assistantVerdict(s,data,offer),v2=assistantVerdict(s,data,offer);
 assert.equal(v1.verdict,v2.verdict);assert.ok(v1.reasons.length>=2);
 const rep=assistantReport(s,data);assert.ok(rep.items.length>=1&&rep.items.length<=5);
 const c=assistantCandidates(s)[0],fee=assistantFee(s,c),cash=s.finance[s.teamId].cash,cost=s.finance[s.teamId].operatingCost;
 assert.ok(hireAssistant(s,c.id).ok);
 assert.equal(s.finance[s.teamId].cash,cash-fee);assert.equal(s.finance[s.teamId].operatingCost,cost+fee);
 assert.equal(s.finance[s.teamId].ledger[0].type,'staff');
 assert.equal(assistantOf(s).name,c.name);assert.notEqual(c.name,a.name);
 s.phase='finished';s.champion=s.teamId;
 const next=advanceSeason(s,data);assert.equal(next.assistant.name,c.name);
});
