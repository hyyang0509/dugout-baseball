import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSeason,migrateSeason,simulateGame,nextDay,hasBat,hasPitch,positionsOf,positionLabel,primaryPosition,defenseAt,ovr,potential,assignFielding} from '../dist/engine.js';
import {batLine,pitchLine,statRows} from '../dist/stats.js';
const load=id=>JSON.parse(fs.readFileSync(new URL(`../dist/data/roster_${id}.json`,import.meta.url)));
const cpbl=load('cpbl'),npb=load('npb'),mlb=load('mlb');

test('positions: a primary spot plus familiar spots; DH is implied, not listed',()=>{
 for(const data of [cpbl,npb,mlb])for(const p of data.players.filter(hasBat)){
  const label=positionLabel(p);
  assert.ok(positionsOf(p).includes('DH'));
  if(primaryPosition(p)!=='DH')assert.ok(!label.includes('DH'),`${p.name} ${label}`);
 }
 const ss=cpbl.players.find(p=>p.position==='SS');
 assert.deepEqual(positionsOf(ss),['SS','2B','3B','DH']);
 // Generic NPB infield/outfield listings are spread over every spot.
 const spots=new Set(npb.players.filter(hasBat).map(primaryPosition));
 for(const pos of ['C','1B','2B','3B','SS','LF','CF','RF'])assert.ok(spots.has(pos),pos);
 // Fielding falls off away from the primary spot.
 assert.ok(defenseAt(ss,'SS')>defenseAt(ss,'2B')&&defenseAt(ss,'2B')>defenseAt(ss,'CF'));
});

test('fielding prefers listed spots and only uses out-of-position emergencies when needed',()=>{
 const s=makeSeason(cpbl,cpbl.teams[0].id,7);
 for(const [id,t] of Object.entries(s.teams)){
  assert.equal(new Set(Object.values(t.fielding)).size,9);
  for(const [pid,pos] of Object.entries(t.fielding))assert.ok(positionsOf(cpbl.players.find(p=>p.id===pid)).includes(pos),`${id} ${pid} ${pos}`);
 }
 const nine=cpbl.players.filter(p=>p.team_id===cpbl.teams[0].id&&hasBat(p)&&p.position!=='C').slice(0,8).map(p=>p.id);
 const catcher=cpbl.players.find(p=>p.team_id===cpbl.teams[0].id&&p.position==='C').id;
 const map=assignFielding([...nine,catcher],cpbl);
 assert.ok(map&&new Set(Object.values(map)).size===9);
 assert.equal(map[catcher],'C');
});

test('overall and potential stay on the same 20-80 scale',()=>{
 const s=makeSeason(mlb,'mlb:119',3);
 for(const p of mlb.players.slice(0,200)){const o=ovr(p),pot=potential(p,s);assert.ok(o>=20&&o<=80,`${p.name} ${o}`);assert.ok(pot>=o);}
});

test('a season of decisions balances: one win and one loss per game, earned runs within runs',()=>{
 const s=makeSeason(cpbl,cpbl.teams[0].id,99);s.aiOnly=true;
 for(let i=0;i<30;i++){s.event=null;nextDay(s,cpbl);}
 const P=Object.values(s.pitching),B=Object.values(s.batting),sum=(a,k)=>a.reduce((x,y)=>x+(y[k]||0),0);
 const games=Object.values(s.teams).reduce((a,t)=>a+t.w,0);
 assert.equal(sum(P,'w'),games);assert.equal(sum(P,'l'),games);assert.equal(sum(P,'gs'),games*2);
 assert.ok(sum(P,'sv')>0&&sum(P,'sv')<=games);assert.ok(sum(P,'hld')>0);
 for(const p of P)assert.ok(p.er<=p.r);
 assert.ok(sum(P,'er')<sum(P,'r'));
 for(const b of B)assert.ok((b.d||0)+(b.t||0)+b.hr<=b.h);
 const l=pitchLine(P.find(p=>p.outs>30));assert.ok(l.era>=0&&l.whip>0);
});

test('box score records the winning and losing pitcher on the right sides',()=>{
 const s=makeSeason(cpbl,cpbl.teams[0].id,5),[away,home]=s.schedule[0][0];
 const g=simulateGame(s,cpbl,away,home);
 const side=id=>g.pitchers.find(p=>p.id===id)?.team_id;
 assert.equal(side(g.decisions.win),g.winner);
 assert.notEqual(side(g.decisions.lose),g.winner);
 if(g.decisions.save)assert.equal(side(g.decisions.save),g.winner);
});

test('older saves keep their runs as earned runs and note when decisions started',()=>{
 const s=makeSeason(cpbl,cpbl.teams[0].id,8);s.aiOnly=true;
 for(let i=0;i<3;i++){s.event=null;nextDay(s,cpbl);}
 const old=JSON.parse(JSON.stringify(s));
 for(const row of Object.values(old.pitching)){for(const k of ['er','w','l','sv','hld','bs','qs','gs','hr'])delete row[k];}
 migrateSeason(old,cpbl);
 assert.equal(old.decisionStatsFrom,3);
 for(const row of Object.values(old.pitching))assert.equal(row.er,row.r);
 old.event=null;nextDay(old,cpbl);
 assert.ok(Object.values(old.pitching).some(r=>r.w>0));
});

test('stat tables sort by the chosen column; rate stats rank qualified players first',()=>{
 const s=makeSeason(cpbl,cpbl.teams[0].id,11);s.aiOnly=true;
 for(let i=0;i<10;i++){s.event=null;nextDay(s,cpbl);}
 const rows=statRows(s,Object.keys(s.pitching),'pit','era',10);
 const q=rows.filter(r=>r.qualified);
 assert.ok(q.length>3&&rows.slice(0,q.length).every(r=>r.qualified));
 for(let i=1;i<q.length;i++)assert.ok(q[i-1].line.era<=q[i].line.era);
 const hr=statRows(s,Object.keys(s.batting),'bat','hr');
 for(let i=1;i<hr.length;i++)assert.ok(hr[i-1].line.hr>=hr[i].line.hr);
 const b=batLine({ab:10,h:4,d:1,t:0,hr:1,bb:2,sf:0});
 assert.equal(b.tb,8);assert.equal(b.slg,.8);assert.equal(b.obp,.5);
});
