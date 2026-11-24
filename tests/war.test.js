import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSeason,nextDay,resolveEvent,teamOf,ovr,hasBat,hasPitch,primaryPosition} from '../dist/engine.js?v=37';
import {warContext,batWar,pitWar,playerWar,statRows,POS_ADJ,fmtWar} from '../dist/stats.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/data/roster_cpbl.json',import.meta.url)));
const byId=Object.fromEntries(data.players.map(p=>[p.id,p]));
function corr(xs,ys){const n=xs.length,mx=xs.reduce((a,b)=>a+b)/n,my=ys.reduce((a,b)=>a+b)/n;let sxy=0,sx=0,sy=0;
 for(let i=0;i<n;i++){sxy+=(xs[i]-mx)*(ys[i]-my);sx+=(xs[i]-mx)**2;sy+=(ys[i]-my)**2;}return sxy/Math.sqrt(sx*sy);}

const ctx={woba:.32,scale:1.2,ra9:4.5,rpw:9.6};
const line={g:10,pa:40,ab:35,h:10,d:2,t:0,hr:1,bb:5,sf:0};

test('batting WAR: better hitting, harder positions and replacement level all add value',()=>{
 const p=data.players.find(p=>hasBat(p)&&!hasPitch(p));
 const base=batWar(line,ctx,p),better=batWar({...line,h:14,hr:3},ctx,p);
 assert.ok(better.war>base.war&&better.bat>base.bat);
 assert.ok(base.rep>0);
 const atC=batWar({...line,pos:{C:10}},ctx,p),atDH=batWar({...line,pos:{DH:10}},ctx,p);
 assert.ok(atC.pos>atDH.pos);assert.equal(atDH.fld,0);
 assert.ok(Math.abs(atC.pos-POS_ADJ.C*10/162)<1e-9);
 // Games without a recorded position (older saves) count at the primary position.
 const unrecorded=batWar({...line,pos:{DH:4}},ctx,p);assert.ok(Math.abs(unrecorded.pos-(POS_ADJ.DH*4+POS_ADJ[primaryPosition(p)]*6)/162)<1e-9);
 assert.equal(batWar(undefined,ctx,p),null);assert.equal(batWar({pa:0},ctx,p),null);
});

test('pitching WAR: fewer runs and starting more innings are worth more',()=>{
 const sp={g:5,gs:5,outs:90,r:8},rp={g:30,gs:0,outs:90,r:8};
 assert.ok(pitWar(sp,ctx).war>pitWar({...sp,r:20},ctx).war);
 assert.ok(pitWar(sp,ctx).war>pitWar(rp,ctx).war);
 assert.equal(pitWar({outs:0},ctx),null);
 assert.equal(fmtWar(null),'—');assert.equal(fmtWar(-0.01),'0.0');assert.equal(fmtWar(2.34),'2.3');
});

test('a season of WAR: totals, positions recorded, leaders and the stat table column',()=>{
 const s=makeSeason(data,data.teams[0].id,4);
 for(let g=0;s.phase==='regular'&&g<200;g++){if(s.event)resolveEvent(s,data,s.event.choices.length-1);nextDay(s,data);}
 const c=warContext(s);
 assert.ok(c.woba>.28&&c.woba<.38);assert.ok(c.rpw>8&&c.rpw<11);
 // Every game a batter played is recorded at a position in this version.
 for(const b of Object.values(s.batting))if(b.g)assert.equal(Object.values(b.pos||{}).reduce((a,n)=>a+n,0),b.g);
 let bat=0,pit=0;
 for(const [id,b] of Object.entries(s.batting))bat+=batWar(b,c,byId[id])?.war||0;
 for(const q of Object.values(s.pitching))pit+=pitWar(q,c)?.war||0;
 // About 1,000 WAR per 30-team, 162-game season, so roughly 100 for 6 teams and 81 games; hitters a bit more than half.
 const total=bat+pit;assert.ok(total>70&&total<130,`total ${total}`);assert.ok(bat/total>.5&&bat/total<.7,`batting share ${bat/total}`);
 const regulars=Object.entries(s.batting).filter(([,b])=>b.pa>=200).map(([id])=>byId[id]);
 assert.ok(corr(regulars.map(ovr),regulars.map(p=>playerWar(s,p,c)))>.15);
 const teamWar={};for(const p of data.players){const w=playerWar(s,p,c);if(w!=null)teamWar[teamOf(s,p)]=(teamWar[teamOf(s,p)]||0)+w;}
 const ids=Object.keys(teamWar);assert.ok(corr(ids.map(id=>teamWar[id]),ids.map(id=>s.teams[id].rs-s.teams[id].ra))>.6);
 const rows=statRows(s,Object.keys(s.batting),'bat','war',0,id=>byId[id]);
 assert.ok(rows[0].line.war>=rows[1].line.war&&rows[0].line.war>1);
 const pitRows=statRows(s,Object.keys(s.pitching),'pit','war');assert.ok(pitRows[0].line.war>=pitRows.at(-1).line.war);
});
