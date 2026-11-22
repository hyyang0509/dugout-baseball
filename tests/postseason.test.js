import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSeason,nextDay,standings,halfStandings,halfBoundary,postseasonFormat,migrateSeason} from '../dist/engine.js?v=33';
import {formatFor,playoffPicture,startPlayoffs,advancePlayoffs,seriesGame,seriesDone,seriesWinner,seriesFormat,migratePlayoffs,MLB_DIVISION,NPB_LEAGUE} from '../dist/postseason.js?v=33';
const load=l=>JSON.parse(fs.readFileSync(new URL(`../dist/data/roster_${l}.json`,import.meta.url)));

// Plays a series to the end: `pick(series)` returns the index (0 or 1) of the winner of each game.
function finish(x,pick=()=>0){while(!seriesDone(x)){const {home}=seriesGame(x);assert.ok(x.teams.includes(home));x.wins[pick(x)]++;x.played++;}}
function playOut(po,pick){let guard=0;while(!po.champion&&guard++<10){for(const x of po.series)finish(x,pick);advancePlayoffs(po);}return po;}

test('each league gets its real format; unknown team sets fall back to a top 4',()=>{
 for(const [l,f] of [['mlb','mlb'],['npb','npb'],['kbo','kbo'],['cpbl','cpbl']])assert.equal(formatFor(l.toUpperCase(),load(l).teams.map(t=>t.id)),f);
 assert.equal(formatFor('MLB',['a','b','c','d','e']),'top4');
 assert.equal(Object.keys(MLB_DIVISION).length,30);assert.equal(Object.keys(NPB_LEAGUE).length,12);
});

test('MLB: 6 per league, division winners seeded 1-3, byes for 1 and 2, wild cards 3v6 and 4v5',()=>{
 const ids=load('mlb').teams.map(t=>t.id),order=[...ids].sort();
 const pic=playoffPicture('mlb',order);assert.equal(pic.seeds.length,12);
 for(const lg of ['AL','NL']){
  const g=pic.groups[lg];assert.equal(g.length,6);assert.ok(g.every(id=>MLB_DIVISION[id].startsWith(lg)));
  const divs=g.slice(0,3).map(id=>MLB_DIVISION[id]);assert.equal(new Set(divs).size,3,'three different division winners');
  // Each division winner is the best of its division in the order; wild cards are the best of the rest.
  for(const id of g.slice(0,3))assert.equal(order.find(x=>MLB_DIVISION[x]===MLB_DIVISION[id]),id);
  const rest=order.filter(id=>MLB_DIVISION[id].startsWith(lg)&&!g.slice(0,3).includes(id));assert.deepEqual(g.slice(3),rest.slice(0,3));
 }
 const po=startPlayoffs('mlb',order);assert.equal(po.round,'wc');assert.equal(po.series.length,4);
 const al=po.groups.AL;assert.deepEqual(po.series.find(x=>x.key==='AL-36').teams,[al[2],al[5]]);assert.deepEqual(po.series.find(x=>x.key==='AL-45').teams,[al[3],al[4]]);
 assert.ok(po.series.every(x=>!x.teams.includes(al[0])&&!x.teams.includes(al[1])));
 // Wild card games are all at the higher seed.
 const wc=po.series[0];for(let i=0;i<3;i++){assert.equal(seriesGame(wc).home,wc.teams[0]);wc.played++;}wc.played=0;
 for(const x of po.series)finish(x);advancePlayoffs(po);
 assert.equal(po.round,'ds');assert.equal(po.series.length,4);assert.ok(po.series.some(x=>x.teams[0]===al[0]&&x.teams[1]===al[3]));assert.ok(po.series.every(x=>x.need===3));
 playOut(po);assert.ok(po.champion);assert.deepEqual(po.history.map(h=>h.round),['wc','ds','lcs','ws']);
 assert.equal(po.history.at(-1).series[0].need,4);
});

test('NPB Climax Series: 2v3 first stage, pennant winner starts the final stage with one win',()=>{
 const order=load('npb').teams.map(t=>t.id);const po=startPlayoffs('npb',order);
 assert.equal(po.round,'first');assert.equal(po.series.length,2);
 for(const x of po.series)finish(x,()=>1);advancePlayoffs(po);
 assert.equal(po.round,'final');for(const x of po.series){assert.deepEqual(x.wins,[1,0]);assert.equal(x.need,4);assert.equal(seriesGame(x).home,x.teams[0]);assert.match(seriesFormat(x),/先得 1 勝/);}
 playOut(po);assert.deepEqual(po.history.map(h=>h.round),['first','final','js']);
 const js=po.history.at(-1).series[0];assert.ok(js.teams.some(id=>NPB_LEAGUE[id]==='CL')&&js.teams.some(id=>NPB_LEAGUE[id]==='PL'));
});

test('KBO step ladder: 4th starts with one win; 3rd, 2nd and 1st wait in turn',()=>{
 const order=load('kbo').teams.map(t=>t.id);const po=startPlayoffs('kbo',order);
 assert.deepEqual(po.series[0].teams,[order[3],order[4]]);assert.deepEqual(po.series[0].wins,[1,0]);assert.equal(po.series[0].need,2);
 // The 5th seed has to win twice.
 finish(po.series[0],()=>1);assert.equal(po.series[0].played,2);assert.equal(seriesWinner(po.series[0]),order[4]);advancePlayoffs(po);
 assert.equal(po.round,'semi');assert.deepEqual(po.series[0].teams,[order[2],order[4]]);
 playOut(po,()=>1);assert.deepEqual(po.history.map(h=>h.round),['wc','semi','po','ks']);assert.equal(po.champion,order[4]);
 assert.equal(po.history[3].series[0].teams[0],order[0]);
});

test('CPBL: different half champions, and one team winning both halves',()=>{
 const order=['a','b','c','d','e','f'];
 // b won the first half, d the second; b has the better full-season record, so it waits in the Taiwan Series.
 let po=startPlayoffs('cpbl',order,{first:['b','a','c','d','e','f'],second:['d','a','b','c','e','f']});
 assert.equal(po.series[0].key,'challenge');assert.deepEqual(po.series[0].teams,['d','a']);assert.deepEqual(po.series[0].wins,[1,0]);assert.equal(po.series[0].need,3);
 assert.equal(seriesGame(po.series[0]).home,'d');po.series[0].played=1;assert.equal(seriesGame(po.series[0]).home,'a');po.series[0].played=0;
 playOut(po,()=>1);assert.deepEqual(po.history[1].series[0].teams,['b','a']);assert.deepEqual(po.history[1].series[0].adv,[0,0]);
 // c won both halves: it starts the Taiwan Series with one win; 2nd and 3rd overall play the challenge series with no edge.
 po=startPlayoffs('cpbl',['a','c','b','d','e','f'],{first:['c','a','b','d','e','f'],second:['c','b','a','d','e','f']});
 assert.ok(po.sweep);assert.deepEqual(po.series[0].teams,['a','b']);assert.deepEqual(po.series[0].wins,[0,0]);
 playOut(po);assert.deepEqual(po.history[1].series[0].teams,['c','a']);assert.deepEqual(po.history[1].series[0].adv,[1,0]);
});

test('a CPBL season records both halves; a full world league reaches a champion in its own format',()=>{
 const data=load('cpbl'),s=makeSeason(data,data.teams[0].id,8);s.aiOnly=true;
 for(let i=0;i<120&&s.phase!=='finished';i++){s.event=null;nextDay(s,data);}
 assert.equal(s.phase,'finished');assert.equal(postseasonFormat(s),'cpbl');
 const sum=half=>halfStandings(s,half).reduce((a,[,r])=>a+r.w+r.l,0);
 assert.equal(sum('first')+sum('second'),Object.values(s.teams).reduce((a,t)=>a+t.w+t.l,0));
 assert.equal(sum('first')/2,halfBoundary(s)*3,'three games a day in the first half');
 assert.deepEqual(s.playoffs.history.map(h=>h.round),['challenge','ts']);
 assert.equal(s.champion,s.playoffs.champion);
});

test('pre-v3.2 brackets keep playing after migration',()=>{
 const po=migratePlayoffs({round:'semifinal',seeds:['a','b','c','d'],series:[{teams:['a','d'],wins:[1,0]},{teams:['b','c'],wins:[0,2]}],game:1});
 assert.equal(po.format,'top4');assert.equal(po.series[0].need,2);assert.equal(po.series[0].played,1);
 playOut(po);assert.ok(['a','c'].includes(po.champion));
 const data=load('mlb'),s=makeSeason(data,data.teams[0].id,3);s.phase='playoffs';s.day=81;
 s.playoffs={round:'final',seeds:[data.teams[0].id,data.teams[1].id],series:[{teams:[data.teams[0].id,data.teams[1].id],wins:[1,1]}],game:2};
 migrateSeason(s,data);s.aiOnly=true;for(let i=0;i<5&&s.phase!=='finished';i++){s.event=null;nextDay(s,data);}
 assert.equal(s.phase,'finished');assert.ok([data.teams[0].id,data.teams[1].id].includes(s.champion));
});
