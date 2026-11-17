import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSeason,simulateGame,setLineup,availableLineup,homeAttendance,gateEstimate,setTicketPrice,nextDay,CONCESSION_PER_FAN} from '../dist/engine.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/data/roster_mlb.json',import.meta.url)));
const fresh=()=>makeSeason(data,'mlb:119',4242);
const opponent=s=>data.teams.find(t=>t.id!==s.teamId).id;

test('manual lineup order is used in games instead of being re-optimized',()=>{
 const s=fresh(),mine=s.teams[s.teamId].lineup,manual=[...mine].reverse();
 setLineup(s,data,s.teamId,manual);s.manualLineup=true;
 const game=simulateGame(s,data,opponent(s),s.teamId);
 assert.deepEqual(game.lineups[1],manual);
});

test('auto mode (default) still re-optimizes the user lineup every game',()=>{
 const s=fresh(),best=[...s.teams[s.teamId].lineup],reversed=[...best].reverse();
 setLineup(s,data,s.teamId,reversed);
 const game=simulateGame(s,data,opponent(s),s.teamId);
 assert.deepEqual(game.lineups[1],best);
});

test('manual lineup substitutes injured starters but keeps the rest of the order',()=>{
 const s=fresh(),manual=[...s.teams[s.teamId].lineup].reverse();
 setLineup(s,data,s.teamId,manual);s.manualLineup=true;
 const hurt=manual[4];s.condition[hurt].injury=3;
 const game=simulateGame(s,data,opponent(s),s.teamId),used=game.lineups[1];
 assert.equal(used.length,9);assert.ok(!used.includes(hurt));
 assert.deepEqual(used.slice(0,4),manual.slice(0,4));
});

test('ticket revenue peaks inside the allowed range and the best price rises with winning',()=>{
 const best=win=>{let top=15,max=-1;for(let p=15;p<=80;p++){const r=homeAttendance(win,p)*(p+CONCESSION_PER_FAN);if(r>max){max=r;top=p;}}return top;};
 const low=best(.3),mid=best(.5),high=best(.7);
 for(const p of [low,mid,high]){assert.ok(p>15&&p<80,`best price ${p} should be interior`);}
 assert.ok(low<=mid&&mid<=high&&low<high,`${low} ${mid} ${high}`);
 assert.ok(homeAttendance(.5,80)<homeAttendance(.5,35));
 assert.ok(homeAttendance(1,15)<=45000&&homeAttendance(0,80)>=3000);
});

test('gate estimate matches the attendance actually booked for a home game',()=>{
 // Attendance is booked with the record after that day's game, so compare against the updated record.
 const s=fresh();setTicketPrice(s,s.teamId,50);let checked=0;
 for(let i=0;i<6;i++){if(s.event)s.event=null;nextDay(s,data);const row=s.finance[s.teamId].ledger[0];
  if(row.attendance){assert.equal(row.attendance,gateEstimate(s,s.teamId,50).attendance);checked++;}}
 assert.ok(checked>0);
});
