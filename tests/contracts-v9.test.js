import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as W from '../dist/world.js';
import * as O from '../dist/offseason.js';
import {resolveEvent,teamOf,rosterFor,salaryOf,salaryFor,contractYears,payroll,hasBat,hasPitch,ovr,isImport,importCount,FOREIGN_LIMIT,evaluateTrade,executeTrade,untouchables,freeAgentPool,signCheck,signFreeAgent,freeAgentDeadline,extensionCheck,extendContract,releaseCheck,tradeDeadline} from '../dist/engine.js';

const raw=id=>JSON.parse(fs.readFileSync(new URL(`../dist/data/roster_${id.toLowerCase()}.json`,import.meta.url),'utf8'));
const bases=Object.fromEntries(W.LEAGUE_ORDER.map(id=>[id,W.toWorldScale(id,raw(id))]));
const world=(seed=11)=>W.makeWorld(bases,'CPBL','cpbl:ACN',seed);
const step=(w,days)=>{for(let i=0;i<days&&W.userSeason(w).phase!=='finished';i++){const u=W.userSeason(w);if(u.event)resolveEvent(u,W.worldDatas(w,bases).CPBL,u.event.choices.length-1);W.worldNextDay(w,W.worldDatas(w,bases));}};
const cpbl=w=>W.worldDatas(w,bases).CPBL;

test('salaries are locked when the deal is signed, not recomputed from ratings',()=>{
 const w=world(),s=W.userSeason(w),d=cpbl(w),p=rosterFor(s,d,s.teamId).find(hasBat);
 assert.ok(Object.keys(s.salaries).length>400);
 const locked=salaryFor(s,p),before=payroll(s,d,s.teamId);
 const old={...p.ratings};p.ratings.contact+=15;p.ratings.power+=15;
 try{assert.equal(salaryFor(s,p),locked);assert.notEqual(salaryOf(p),locked);assert.equal(payroll(s,d,s.teamId),before);}
 finally{Object.assign(p.ratings,old);}
});

test('midseason free agents: weekly pool, import limit, and the signing deadline',()=>{
 const w=world(12),s=W.userSeason(w);step(w,3);
 let d=cpbl(w);const pool=freeAgentPool(s,d);
 assert.equal(pool.length,6);assert.ok(pool.every(p=>p.simulated&&isImport(p,'CPBL')));
 const imports=rosterFor(s,d,s.teamId).filter(p=>isImport(p,'CPBL')).length;
 const c=signCheck(s,d,pool[0].id);
 if(imports>=FOREIGN_LIMIT.CPBL)assert.ok(c.reasons.some(r=>/洋將名額/.test(r)));
 // Make room: drop the club's imports from the count by treating them as domestic.
 const mine=rosterFor(s,d,s.teamId).filter(p=>isImport(p,'CPBL'));const saved=mine.map(p=>p.origin);mine.forEach(p=>{p.origin='TWN';});
 try{
  const before=payroll(s,d,s.teamId),c2=signCheck(s,d,pool[0].id);assert.ok(c2.ok,c2.reasons.join());
  const p=signFreeAgent(s,d,pool[0].id);d=cpbl(w);
  assert.equal(teamOf(s,p),s.teamId);assert.ok(d.players.some(q=>q.id===p.id));
  assert.equal(contractYears(s,p),1);assert.ok(payroll(s,d,s.teamId)>before);
  assert.ok(!freeAgentPool(s,d).some(q=>q.id===p.id));
  step(w,2);
  s.day=freeAgentDeadline(s);assert.ok(signCheck(s,cpbl(w),freeAgentPool(s,cpbl(w))[0].id).reasons.some(r=>/截止/.test(r)));
 }finally{mine.forEach((p,i)=>{p.origin=saved[i];});}
});

test('extensions: lowballs are refused with a cooldown; fair offers extend the deal',()=>{
 const w=world(13),s=W.userSeason(w);step(w,2);const d=cpbl(w);
 const p=rosterFor(s,d,s.teamId).find(q=>contractYears(s,q)===1);assert.ok(p);
 const c=extensionCheck(s,d,p.id);assert.ok(c.ok,c.reasons.join());assert.ok(c.floor<=c.ask);
 assert.equal(extendContract(s,d,p.id,{salary:Math.max(10000,c.floor-200000),years:2}).ok,false);
 assert.ok(extensionCheck(s,d,p.id).reasons.some(r=>/天後/.test(r)));
 s.day+=16;const ok=extendContract(s,d,p.id,{salary:c.ask,years:3});assert.ok(ok.ok);
 assert.equal(contractYears(s,p),4);assert.equal(s.pendingSalary[p.id],c.ask);
});

test('CPBL imports cannot change teams during the season; cash-only purchases are allowed',()=>{
 const w=world(14),s=W.userSeason(w);step(w,2);const d=cpbl(w),other='cpbl:L01'in s.teams?'cpbl:L01':d.teams.find(t=>t.id!==s.teamId).id;
 const imp=rosterFor(s,d,other).find(p=>isImport(p,'CPBL')&&!untouchables(s,d,other).includes(p.id));
 const mine=rosterFor(s,d,s.teamId).find(p=>!isImport(p,'CPBL')&&hasPitch(p));
 if(imp)assert.ok(evaluateTrade(s,d,{targetTeam:other,give:[mine.id],get:[imp.id]}).reasons.some(r=>/洋將同一年度/.test(r)));
 const cheap=rosterFor(s,d,other).filter(p=>!isImport(p,'CPBL')&&!untouchables(s,d,other).includes(p.id)).sort((a,b)=>ovr(a)-ovr(b))[0];
 const r=evaluateTrade(s,d,{targetTeam:other,give:[],get:[cheap.id],cash:10000});
 const r2=evaluateTrade(s,d,{targetTeam:other,give:[],get:[cheap.id],cash:Math.max(10000,r.neededCash)});
 assert.ok(r2.ok,r2.reasons.join());
 assert.equal(evaluateTrade(s,d,{targetTeam:other,give:[],get:[cheap.id],cash:0}).ok,false);
});

test('offseason: negotiated re-signings, controlled raises, offseason trades and releases',()=>{
 const w=world(15);step(w,400);
 const o=O.startOffseason(w,bases),s=W.userSeason(o),d=cpbl(o);
 assert.ok(s.offseasonTrades);
 const exp=o.offseason.userExpiring;assert.ok(exp.length>=2,'needs expiring players');
 assert.ok(exp.every(r=>r.ask>=r.floor&&r.salary===r.ask));
 // The re-signed player must not be old enough to retire at random during the rollover.
 const low=exp[0],fair=exp.slice(1).sort((a,b)=>a.age-b.age)[0];
 O.setExpiringOffer(o,low.id,{salary:Math.max(10000,low.floor-500000)});
 O.setExpiringOffer(o,fair.id,{salary:fair.ask,years:2});
 for(const r of o.offseason.userControlled)assert.ok(r.salary>=salaryFor(s,d.players.find(p=>p.id===r.id)));
 // Expiring players cannot be traded; contracted ones can.
 const other=d.teams.find(t=>t.id!==s.teamId).id;
 const theirs=rosterFor(s,d,other).filter(p=>contractYears(s,p)>1&&!untouchables(s,d,other).includes(p.id)).sort((a,b)=>ovr(a)-ovr(b));
 const blocked=evaluateTrade(s,d,{targetTeam:other,give:[low.id],get:[theirs[0].id],cash:0});
 assert.ok(blocked.reasons.some(r=>/合約到期/.test(r)));
 const mine=rosterFor(s,d,s.teamId).filter(p=>contractYears(s,p)>1).sort((a,b)=>ovr(b)-ovr(a));
 let traded=null;for(const g of mine.slice(0,8)){const r=evaluateTrade(s,d,{targetTeam:other,give:[g.id],get:[theirs[0].id],cash:0});if(r.ok){executeTrade(s,d,r.offer);traded=theirs[0];break;}}
 assert.ok(traded,'an offseason trade went through');
 // Release a contracted player: the whole remaining deal is paid now and he joins the market.
 const cut=rosterFor(s,d,s.teamId).filter(p=>contractYears(s,p)>2&&p.id!==traded.id).sort((a,b)=>ovr(a)-ovr(b))[0]||rosterFor(s,d,s.teamId).filter(p=>contractYears(s,p)>1&&p.id!==traded.id)[0];
 const check=releaseCheck(s,d,cut.id);assert.ok(check.ok,check.reasons.join());
 assert.equal(check.owed,salaryFor(s,cut)*(contractYears(s,cut)-1));
 const cash=s.finance[s.teamId].cash;O.releaseInOffseason(o,bases,cut.id);
 assert.equal(s.finance[s.teamId].cash,cash-check.owed);
 assert.ok(o.offseason.freeAgents.some(r=>r.id===cut.id));
 const n=O.completeOffseason(o,bases),ns=W.userSeason(n),nd=cpbl(n);
 const find=id=>nd.players.find(p=>p.id===id);
 assert.notEqual(find(low.id)&&teamOf(ns,find(low.id)),ns.teamId,'lowball offer refused');
 assert.ok(ns.news.some(x=>/拒絕續約/.test(x.title)));
 assert.equal(teamOf(ns,find(fair.id)),ns.teamId);assert.equal(ns.salaries[fair.id],fair.ask);assert.equal(ns.contracts[fair.id],2);
 assert.equal(teamOf(ns,find(traded.id)),ns.teamId);
 assert.ok(!ns.offseasonTrades);
 for(const p of rosterFor(ns,nd,ns.teamId))assert.ok(ns.salaries[p.id]>0);
});

test('offseason: a club-controlled (auto-renewing) player can be let go for free',()=>{
 const w=world(15);step(w,400);
 const o=O.startOffseason(w,bases),s=W.userSeason(o),d=cpbl(o);
 const ctrl=o.offseason.userControlled;assert.ok(ctrl.length,'needs a controlled player');
 const r=ctrl.sort((a,b)=>a.ovr-b.ovr)[0];
 // The plain check still points other expiring players to the expiring list; this one has no such list.
 assert.ok(releaseCheck(s,d,r.id).reasons.some(x=>/到期合約/.test(x)));
 const check=O.offseasonReleaseCheck(o,bases,r.id);assert.ok(check.ok,check.reasons.join());
 assert.equal(check.owed,0);
 const cash=s.finance[s.teamId].cash;O.releaseInOffseason(o,bases,r.id);
 assert.equal(s.finance[s.teamId].cash,cash);
 assert.ok(!o.offseason.userControlled.some(x=>x.id===r.id));assert.ok(!o.offseason.resigned.CPBL.includes(r.id));
 assert.ok(o.offseason.freeAgents.some(x=>x.id===r.id));
 const n=O.completeOffseason(o,bases),ns=W.userSeason(n),p=cpbl(n).players.find(x=>x.id===r.id);
 assert.ok(!p||teamOf(ns,p)!==ns.teamId,'he left the club');
});
