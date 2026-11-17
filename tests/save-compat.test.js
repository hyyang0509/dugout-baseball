import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSeason,migrateSeason,nextDay,resolveEvent,seasonData,saveVersionSupported,missingSavePlayers,VERSION} from '../dist/engine.js';
const base=JSON.parse(fs.readFileSync(new URL('../dist/data/roster_mlb.json',import.meta.url)));
function play(s,data,days){for(let i=0;i<days&&s.phase!=='finished';i++){if(s.event)resolveEvent(s,data,s.event.choices.length-1);nextDay(s,data);}return s;}

test('save versions 1..VERSION load, newer or malformed versions do not',()=>{
 for(let v=1;v<=VERSION;v++)assert.equal(saveVersionSupported(v),true);
 assert.equal(saveVersionSupported(VERSION+1),false);
 assert.equal(saveVersionSupported(0),false);
 assert.equal(saveVersionSupported('5'),false);
 assert.equal(saveVersionSupported(undefined),false);
});

test('an in-progress save has no missing players against its own roster',()=>{
 const s=play(makeSeason(base,'mlb:119',24680),base,20);
 assert.deepEqual(missingSavePlayers(s,seasonData(base,s)),[]);
});

test('a roster refresh that adds a call-up keeps the save loadable and backfills condition',()=>{
 const s=JSON.parse(JSON.stringify(play(makeSeason(base,'mlb:119',13579),base,10)));
 const callUp={...base.players.find(p=>p.team_id==='mlb:119'),id:'mlb:callup-test',name:'Call Up Test'};
 const refreshed={...base,players:[...base.players,callUp]};
 assert.deepEqual(missingSavePlayers(s,refreshed),[]);
 migrateSeason(s,refreshed);
 assert.ok(s.condition[callUp.id]);
 play(s,refreshed,5);
});

test('a roster refresh that removes a referenced player is still rejected',()=>{
 const s=play(makeSeason(base,'mlb:119',11223),base,5);
 const gone=s.teams['mlb:119'].lineup[0];
 const refreshed={...base,players:base.players.filter(p=>p.id!==gone)};
 assert.deepEqual(missingSavePlayers(s,refreshed),[gone]);
});
