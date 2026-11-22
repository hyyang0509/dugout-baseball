import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSeason,nextDay,resolveEvent,plateOdds,hasBat,hasPitch,batValue,pitchValue,rosterFor} from '../dist/engine.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/data/roster_mlb.json',import.meta.url)));

function corr(xs,ys){const n=xs.length,mx=xs.reduce((a,b)=>a+b)/n,my=ys.reduce((a,b)=>a+b)/n;let sxy=0,sx=0,sy=0;
 for(let i=0;i<n;i++){sxy+=(xs[i]-mx)*(ys[i]-my);sx+=(xs[i]-mx)**2;sy+=(ys[i]-my)**2;}return sxy/Math.sqrt(sx*sy);}

test('plate odds: each rating moves the outcomes it should',()=>{
 const s=makeSeason(data,data.teams[0].id,5);
 const bat=data.players.find(p=>hasBat(p)&&!hasPitch(p)),arm=data.players.find(p=>hasPitch(p)&&!hasBat(p));
 const with_=(p,key,v)=>({...p,ratings:{...p.ratings,[key]:v}});
 const base=plateOdds(s,with_(bat,'speed',50),arm);
 const lo=k=>plateOdds(s,bat,with_(arm,k,35)),hi=k=>plateOdds(s,bat,with_(arm,k,70));
 // Stuff: more strikeouts and fewer hits allowed (strikeouts must not only replace outs on balls in play).
 assert.ok(hi('stuff').k>lo('stuff').k);assert.ok(hi('stuff').hit<lo('stuff').hit);
 // Control: fewer walks and weaker contact on balls in play (hits per ball in play, not per plate appearance).
 const babip=o=>o.hit/(1-o.k-o.bb-o.hr);
 assert.ok(hi('control').bb<lo('control').bb);assert.ok(babip(hi('control'))<babip(lo('control')));
 assert.ok(hi('movement').hr<lo('movement').hr);assert.ok(hi('movement').hit<lo('movement').hit);
 // Speed: more hits on balls in play and more doubles and triples.
 const fast=plateOdds(s,with_(bat,'speed',75),arm);
 assert.ok(fast.hit>base.hit);assert.ok(fast.double>base.double);assert.ok(fast.triple>base.triple);
 // Better defence turns more balls in play into outs.
 assert.ok(plateOdds(s,bat,arm,65).hit<plateOdds(s,bat,arm,40).hit);
 for(const o of [base,fast,lo('stuff'),hi('stuff')])assert.ok(o.k+o.bb+o.hr+o.hit<1);
});

test('a full season: ratings line up with results and scoring stays realistic',()=>{
 const s=makeSeason(data,data.teams[0].id,2);
 for(let g=0;s.phase==='regular'&&g<200;g++){if(s.event)resolveEvent(s,data,s.event.choices.length-1);nextDay(s,data);}
 const byId=Object.fromEntries(data.players.map(p=>[p.id,p]));
 const B=Object.entries(s.batting).filter(([id,b])=>hasBat(byId[id])&&b.pa>=200).map(([id,b])=>({v:batValue(byId[id]),ops:(b.h+b.bb)/b.pa+(b.h+(b.d||0)+2*(b.t||0)+3*b.hr)/b.ab}));
 const P=Object.entries(s.pitching).filter(([,q])=>q.outs>=150).map(([id,q])=>({v:pitchValue(byId[id]),era:q.er*27/q.outs}));
 const T=data.teams.map(t=>{const ros=rosterFor(s,data,t.id),top=(list,n)=>list.sort((a,b)=>b-a).slice(0,n).reduce((a,b)=>a+b,0)/n;
  return {v:top(ros.filter(hasBat).map(batValue),9)+top(ros.filter(p=>hasPitch(p)&&!hasBat(p)).map(pitchValue),9),wp:s.teams[t.id].w/(s.teams[t.id].w+s.teams[t.id].l)};});
 assert.ok(B.length>200&&P.length>100);
 // Before v2.8 these were about 0.54, -0.32 and 0.36.
 assert.ok(corr(B.map(x=>x.v),B.map(x=>x.ops))>.5,'batting ratings should predict OPS');
 assert.ok(corr(P.map(x=>x.v),P.map(x=>x.era))<-.5,'pitching ratings should predict ERA');
 assert.ok(corr(T.map(x=>x.v),T.map(x=>x.wp))>.45,'team strength should predict winning percentage');
 const runs=Object.values(s.teams).reduce((a,t)=>a+t.rs,0)/Object.values(s.teams).reduce((a,t)=>a+t.w+t.l,0);
 assert.ok(runs>3.8&&runs<5.2,`runs per team game ${runs.toFixed(2)}`);
});
