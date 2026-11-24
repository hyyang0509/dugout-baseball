import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSeason,nextDay,rosterFor,teamOf,positionsOf,hasBat,hasPitch} from '../dist/engine.js?v=39';
import {bestLineup,DEPTH_SPOTS,spotValue} from '../dist/gm.js';
import {defenseDiagram,shortName} from '../dist/art.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/data/roster_mlb.json',import.meta.url)));
const season=()=>{const s=makeSeason(data,data.teams[0].id,31);s.aiOnly=true;for(let i=0;i<3;i++){s.event=null;nextDay(s,data);}s.event=null;return s;};

test('best lineup: nine fielding spots plus five starters and a reliever, ranked against the league',()=>{
 const s=season(),b=bestLineup(s,data,s.teamId),n=data.teams.length;
 assert.deepEqual(b.spots.map(x=>x.key),DEPTH_SPOTS);
 const ids=b.spots.map(x=>x.id);assert.equal(new Set(ids).size,ids.length,'nobody fills two spots');
 const byId=Object.fromEntries(data.players.map(p=>[p.id,p]));
 for(const x of b.spots){
  const p=byId[x.id];assert.equal(teamOf(s,p),s.teamId);assert.ok(!s.condition[p.id].injury);
  assert.ok(x.rank>=1&&x.rank<=n);
  assert.equal(x.tone,x.rank<=Math.ceil(n/3)?'strong':x.rank>n-Math.ceil(n/3)?'weak':'');
  if(!/^SP|^RP/.test(x.key)){assert.ok(hasBat(p));assert.ok(x.key==='DH'||positionsOf(p).includes(x.key),`${x.key} ${p.name}`);assert.equal(x.value,spotValue(p,x.key));}
  else assert.ok(hasPitch(p));
 }
 for(let i=1;i<5;i++)assert.ok(b.spots.find(x=>x.key===`SP${i}`).value>=b.spots.find(x=>x.key===`SP${i+1}`).value);
 assert.deepEqual(b.upgrades.map(x=>x.key).sort(),b.spots.filter(x=>x.tone==='weak').map(x=>x.key).sort());
 // Every club's ranks at one spot are a permutation-like spread: the league's best is ranked 1.
 const firsts=data.teams.filter(t=>bestLineup(s,data,t.id).spots.find(x=>x.key==='SS')?.rank===1);assert.ok(firsts.length>=1);
});

test('defense diagram: optional second line and weak spots in red; plain labels unchanged',()=>{
 assert.equal(shortName('Bobby Witt Jr.'),'Witt');assert.equal(shortName('Ken Griffey III'),'Griffey');assert.equal(shortName('Jr.'),'Jr.');
 const plain=defenseDiagram([{pos:'SS',name:'A B'}]);assert.ok(!plain.includes('font-size="9"'));
 const svg=defenseDiagram([{pos:'SS',name:'A B',tag:'72 · 第3',tone:'weak'},{pos:'C',name:'C D',tag:'<x>',tone:'strong'}]);
 assert.ok(svg.includes('72 · 第3'));assert.ok(svg.includes('stroke="var(--art-red)"'));assert.ok(!svg.includes('<x>'));
});
