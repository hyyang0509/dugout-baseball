import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as W from '../dist/world.js';
import * as O from '../dist/offseason.js';
import {resolveEvent,ovr,g100,FOREIGN_LIMIT,isImport,rosterFor} from '../dist/engine.js';
const raw=id=>JSON.parse(fs.readFileSync(new URL(`../dist/data/roster_${id.toLowerCase()}.json`,import.meta.url),'utf8'));
const bases=Object.fromEntries(W.LEAGUE_ORDER.map(id=>[id,W.toWorldScale(id,raw(id))]));

test('the 1–100 display scale: MLB stars near 99, leagues ordered, CPBL stars around 80',()=>{
 assert.equal(g100(50),70);assert.ok(g100(80)===100&&g100(20)>=1);
 const top=id=>Math.max(...bases[id].players.map(p=>g100(ovr(p))));
 assert.ok(top('MLB')>=95,`MLB ${top('MLB')}`);
 assert.ok(top('MLB')>=top('NPB')&&top('NPB')>=top('CPBL'));
 assert.ok(top('CPBL')>=74&&top('CPBL')<=90,`CPBL ${top('CPBL')}`);
 assert.ok(top('KBO')>top('CPBL'),`KBO ${top('KBO')}`);
});

test('KBO joins the world: Korean players are home in KBO, imports capped at 4',()=>{
 const w=W.makeWorld(bases,'KBO','kbo:HT',4),s=W.userSeason(w),d=W.worldDatas(w,bases).KBO;
 assert.equal(s.league,'KBO');assert.equal(FOREIGN_LIMIT.KBO,4);
 const kor=d.players.filter(p=>p.origin==='KOR').length;assert.ok(kor>550);
 for(const t of d.teams)assert.ok(rosterFor(s,d,t.id).filter(p=>isImport(p,'KBO')).length<=4);
 assert.ok(bases.MLB.players.some(p=>p.origin==='KOR'));
});

test('older saves without KBO get a KBO season that catches up to the user league',()=>{
 const w=W.makeWorld(bases,'CPBL','cpbl:ACN',8);
 for(let i=0;i<6;i++){const u=W.userSeason(w);if(u.event)resolveEvent(u,W.worldDatas(w,bases).CPBL,u.event.choices.length-1);W.worldNextDay(w,W.worldDatas(w,bases));}
 const old=JSON.parse(JSON.stringify(w));delete old.leagues.KBO;
 const r=W.restoreWorld(old,bases);
 assert.ok(r.leagues.KBO&&r.leagues.KBO.aiOnly);
 assert.equal(r.leagues.KBO.day,W.userSeason(r).day);
 W.worldNextDay(r,W.worldDatas(r,bases));
});

test('players cross leagues every offseason',()=>{
 const w=W.makeWorld(bases,'CPBL','cpbl:ACN',21);
 while(W.userSeason(w).phase!=='finished'){const u=W.userSeason(w);if(u.event)resolveEvent(u,W.worldDatas(w,bases).CPBL,u.event.choices.length-1);W.worldNextDay(w,W.worldDatas(w,bases));}
 const o=O.startOffseason(w,bases);for(const r of o.offseason.userExpiring)O.setExpiringDecision(o,r.id,true);
 const n=O.completeOffseason(o,bases),market=W.userSeason(n).offseason.market,cross=market.cross,moves=market.moves;
 console.log('moves',moves.length,'cross-league',cross.length,[...new Set(cross.map(m=>m.fromLeague+'>'+m.toLeague))].join(' '));
 assert.ok(cross.length>=8,`cross-league moves: ${cross.length}`);
 assert.ok(cross.some(m=>m.toLeague==='KBO'||m.fromLeague==='KBO'));
});
