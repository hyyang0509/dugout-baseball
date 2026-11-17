import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSeason,makeEvent,resolveEvent,nextDay,rosterFor,evaluateTrade,executeTrade,tradeCounters,teamStrategy,strategyValue,untouchables,playerTraits,playerAge,tradeDeadline,standings} from '../dist/engine.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/data/roster_mlb.json',import.meta.url)));
const fresh=(seed=77)=>makeSeason(data,'mlb:119',seed);
const clubsBy=(s,kind)=>data.teams.filter(t=>teamStrategy(s,data,t.id)===kind).map(t=>t.id);

test('every club gets a strategy and contenders follow the standings once games are played',()=>{
 const s=fresh();for(const k of ['contender','balanced','rebuilding'])assert.ok(clubsBy(s,k).length>0,k);
 for(let i=0;i<14;i++){if(s.event)resolveEvent(s,data,s.event.choices.length-1);nextDay(s,data);}
 const top=standings(s)[0][0],bottom=standings(s).at(-1)[0];
 assert.equal(teamStrategy(s,data,top),'contender');assert.equal(teamStrategy(s,data,bottom),'rebuilding');
});

test('rebuilding clubs prize youth, contenders prize veterans',()=>{
 const s=fresh(),con=clubsBy(s,'contender')[0],reb=clubsBy(s,'rebuilding')[0];
 const all=data.players.filter(p=>p.birth_date);
 const young=all.filter(p=>playerAge(s,p)<=24).sort((a,b)=>(b.ratings.contact??0)-(a.ratings.contact??0))[0];
 const old=all.filter(p=>playerAge(s,p)>=32)[0];
 assert.ok(strategyValue(s,data,reb,young)/strategyValue(s,data,con,young)>1.2);
 assert.ok(strategyValue(s,data,con,old)>strategyValue(s,data,reb,old));
});

test('AI untouchables are refused with a clear reason',()=>{
 const s=fresh(),target=data.teams.find(t=>t.id!==s.teamId).id,star=untouchables(s,data,target)[0];
 const give=rosterFor(s,data,s.teamId)[0];
 const r=evaluateTrade(s,data,{targetTeam:target,giveId:give.id,getId:star,cash:20000000});
 assert.equal(r.ok,false);assert.ok(r.reasons.some(x=>x.includes('非賣品')));
});

test('a rejected draft comes back with counteroffers the AI would accept',()=>{
 const s=fresh();let checked=0;
 for(const t of data.teams.filter(t=>t.id!==s.teamId).slice(0,6)){
  const get=rosterFor(s,data,t.id).filter(p=>!untouchables(s,data,t.id).includes(p.id)).sort((a,b)=>(b.ratings.contact??b.ratings.stuff)-(a.ratings.contact??a.ratings.stuff))[0];
  const give=rosterFor(s,data,s.teamId).sort((a,b)=>(a.ratings.contact??a.ratings.stuff)-(b.ratings.contact??b.ratings.stuff))[0];
  const draft={targetTeam:t.id,giveId:give.id,getId:get.id,cash:0};
  if(evaluateTrade(s,data,draft).ok)continue;
  const counters=tradeCounters(s,data,draft);
  for(const c of counters){assert.ok(evaluateTrade(s,data,c.offer).ok,c.label);assert.ok(c.label);}
  if(counters.length)checked++;
 }
 assert.ok(checked>=3,`counters found for ${checked} clubs`);
});

test('trade offers surge in the ten days before the deadline and explain the motive',()=>{
 const count=(day)=>{const s=fresh(5);s.day=day;let n=0;for(let i=0;i<80;i++){makeEvent(s,data);if(s.event?.type==='trade_offer'||s.event?.type==='league_trade')n++;if(s.event?.type==='trade_offer')assert.match(s.event.text,/想|興趣/);s.event=null;}return n;};
 const early=count(5),late=count(tradeDeadline(fresh())-5);
 assert.ok(late>early*1.6,`early ${early} late ${late}`);
});

test('clubhouse reacts to trading away a leader and to a broken no-trade promise',()=>{
 const s=fresh(9),target=data.teams.find(t=>t.id!==s.teamId).id;
 const leader=rosterFor(s,data,s.teamId).find(p=>playerTraits(s,p).includes('leader'));
 let offer=null;
 for(const get of rosterFor(s,data,target)){const o={targetTeam:target,giveId:leader.id,getId:get.id,cash:0};if(evaluateTrade(s,data,o).ok){offer=o;break;}}
 assert.ok(offer,'found a legal trade for the leader');
 s.storyFlags={promised_no_trade:s.day};const before=s.teams[s.teamId].morale;
 executeTrade(s,data,offer);
 assert.ok(s.teams[s.teamId].morale<=before-12,`${before} -> ${s.teams[s.teamId].morale}`);
 assert.ok(s.news.some(n=>n.title==='更衣室對交易的反應'&&n.text.includes('承諾')));
 assert.equal(s.storyFlags.promised_no_trade,undefined);
});
