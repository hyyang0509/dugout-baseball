// DUGOUT simulation v4. Seeded randomness, browser-independent engine.
export const VERSION=5;
export const SEASON_GAMES=81;
export const EVENT_RATE=.40;
export const seasonGames=s=>s.schedule.length;
export const tradeDeadline=s=>Math.floor(seasonGames(s)*.76);
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function random(s){let x=s.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
export const hasBat=p=>p.ratings.contact!=null;
export const hasPitch=p=>p.ratings.stuff!=null;
export const batValue=p=>(p.ratings.contact||50)*.35+(p.ratings.power||50)*.35+(p.ratings.eye||50)*.2+(p.ratings.speed||50)*.1;
export const pitchValue=p=>(p.ratings.stuff||50)*.4+(p.ratings.control||50)*.3+(p.ratings.movement||50)*.3;
export function makeSchedule(ids){
 const ring=[...ids],rounds=[];
 for(let day=0;day<ids.length-1;day++){
  const games=[];for(let i=0;i<ring.length/2;i++){let a=ring[i],b=ring[ring.length-1-i];games.push(day%2?[a,b]:[b,a]);}
  rounds.push(games);ring.splice(1,0,ring.pop());
 }
 const base=[...rounds,...rounds.map(round=>round.map(([a,b])=>[b,a]))];
 // The first 58 rounds stay unchanged for old saves. Orient 23 more rounds
 // along an Euler circuit to give every team 40 or 41 home games overall.
 const extra=rounds.slice(0,SEASON_GAMES-base.length);
 const n=ids.length,dummy=n,adj=Array.from({length:n+1},()=>[]),used=[],index=new Map(ids.map((id,i)=>[id,i]));
 function add(a,b){const key=used.length;used.push(false);adj[a].push([b,key]);adj[b].push([a,key]);}
 for(const day of extra)for(const [a,b] of day)add(index.get(a),index.get(b));
 for(let i=0;i<n;i++)add(i,dummy);
 const stack=[dummy],path=[];
 while(stack.length){const v=stack.at(-1);while(adj[v].length&&used[adj[v].at(-1)[1]])adj[v].pop();if(!adj[v].length)path.push(stack.pop());else{const [w,key]=adj[v].pop();used[key]=true;stack.push(w);}}
 path.reverse();const directions=new Map();
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];if(a!==dummy&&b!==dummy)directions.set([a,b].sort((x,y)=>x-y).join(':'),[ids[a],ids[b]]);}
 return [...base,...extra.map(day=>day.map(([a,b])=>directions.get([index.get(a),index.get(b)].sort((x,y)=>x-y).join(':'))))];
}
export const FIELD_POSITIONS=['C','1B','2B','3B','SS','LF','CF','RF','DH'];
export const teamOf=(s,p)=>s.ownership?.[p.id]||p.team_id;
export const rosterFor=(s,data,id)=>data.players.filter(p=>teamOf(s,p)===id);
export const positionsOf=p=>p.positions||[p.position,...(hasBat(p)&&p.position!=='DH'?['DH']:[])];
export function assignFielding(ids,data,preferred={},scores={}){
 const byId=Object.fromEntries(data.players.map(p=>[p.id,p]));const assigned={};
 const slots=[...FIELD_POSITIONS].sort((a,b)=>ids.filter(id=>positionsOf(byId[id]).includes(a)).length-ids.filter(id=>positionsOf(byId[id]).includes(b)).length);
 function place(pos,seen){
  const candidates=ids.filter(id=>positionsOf(byId[id]).includes(pos)).sort((a,b)=>(preferred[b]===pos)-(preferred[a]===pos)||(scores[b]??batValue(byId[b]))-(scores[a]??batValue(byId[a])));
  for(const id of candidates){if(seen.has(id))continue;seen.add(id);const old=assigned[id];if(!old||place(old,seen)){assigned[id]=pos;return true;}}
  return false;
 }
 for(const pos of slots)if(!place(pos,new Set()))return null;
 return assigned;
}
export function lineupValue(p,c={}){return batValue(p)*(1+(c.form||0)*.09)-Math.max(0,75-(c.energy??100))*.5;}
export function optimizeLineup(s,data,teamId){
 const ids=autoLineup(rosterFor(s,data,teamId),s.condition);
 if(ids.length!==9)throw new Error('健康球員無法涵蓋九個守位，請補強名單。');
 s.teams[teamId].lineup=ids;s.teams[teamId].fielding=assignFielding(ids,data);return ids;
}
export function autoLineup(roster,condition={}){
 const pool=roster.filter(p=>hasBat(p)&&!(condition[p.id]?.injury>0)).sort((a,b)=>{
  const value=p=>lineupValue(p,condition[p.id]);
  return value(b)-value(a);
 });
 const data={players:pool},byId=Object.fromEntries(pool.map(p=>[p.id,p]));
 const scores=Object.fromEntries(pool.map(p=>[p.id,lineupValue(p,condition[p.id])]));
 const assignments=assignFielding(pool.map(p=>p.id),data,{},scores);
 return assignments?Object.keys(assignments).sort((a,b)=>lineupValue(byId[b],condition[b])-lineupValue(byId[a],condition[a])):[];
}
export function makeSeason(data,teamId,seed=Date.now()){
 const teams={};const condition={};
 for(const p of data.players)condition[p.id]={energy:100,injury:0,form:0,formDays:0};
 for(const t of data.teams){const roster=data.players.filter(p=>p.team_id===t.id);const pitchers=roster.filter(hasPitch).sort((a,b)=>(b.role==='SP')-(a.role==='SP')||pitchValue(b)-pitchValue(a));
 teams[t.id]={w:0,l:0,rs:0,ra:0,lineup:autoLineup(roster),rotation:pitchers.slice(0,5).map(p=>p.id)};}
 return migrateSeason({version:VERSION,dataVersion:data.generated_at,teamId,rng:(seed>>>0)||1234567,day:0,phase:'regular',schedule:makeSchedule(data.teams.map(t=>t.id)),teams,condition,batting:{},pitching:{},history:[],lastGame:null,event:null,eventLog:[],playoffs:null,champion:null,createdAt:new Date().toISOString()},data);
}
function batting(s,id){return s.batting[id]??=( {g:0,pa:0,ab:0,h:0,hr:0,rbi:0,bb:0,k:0,r:0});}
function pitching(s,id){return s.pitching[id]??=({g:0,outs:0,h:0,r:0,bb:0,k:0,pitches:0});}
export function availableLineup(s,data,teamId){
 const roster=rosterFor(s,data,teamId);const healthy=roster.filter(p=>hasBat(p)&&!s.condition[p.id].injury);
 const old=s.teams[teamId].lineup.filter(id=>healthy.some(p=>p.id===id)&&s.condition[id].energy>=35);
 let wanted=[...new Set(old)];
 const ranked=[...healthy].sort((a,b)=>{
  const value=p=>batValue(p)-Math.max(0,65-s.condition[p.id].energy)*.45;
  return value(b)-value(a);
 });
 const candidateIds=[...wanted,...ranked.filter(p=>!wanted.includes(p.id)).map(p=>p.id)];
 const preferred=Object.fromEntries(Object.entries(s.teams[teamId].fielding||{}).filter(([id])=>wanted.includes(id)));
 const scores=Object.fromEntries(ranked.map(p=>[p.id,batValue(p)-Math.max(0,65-s.condition[p.id].energy)*.45]));
 let assignment=assignFielding(candidateIds,data,preferred,scores);
 // Prefer the manager's healthy nine when they can cover the field.
 if(wanted.length===9){const preferred=assignFielding(wanted,data,s.teams[teamId].fielding||{});if(preferred)assignment=preferred;}
 if(!assignment)throw new Error('健康打者無法涵蓋九個守位，請調整名單。');
 const selected=new Set(Object.keys(assignment));
 wanted=[...wanted.filter(id=>selected.has(id)),...Object.keys(assignment).filter(id=>!wanted.includes(id))];
 s.teams[teamId].lineup=wanted;s.teams[teamId].fielding=assignment;
 return wanted;
}
export function setLineup(s,data,teamId,ids){
 if(ids.length!==9||new Set(ids).size!==9)throw new Error('打線需要九名不同的球員。');
 if(ids.some(id=>!rosterFor(s,data,teamId).some(p=>p.id===id&&hasBat(p))||s.condition[id].injury))throw new Error('請選擇本隊健康打者。');
 const assignment=assignFielding(ids,data,s.teams[teamId].fielding||{});
 if(!assignment)throw new Error('這組打線無法涵蓋九個守位，請保留捕手及各守位球員。');
 s.teams[teamId].lineup=[...ids];s.teams[teamId].fielding=assignment;
}
export function setPosition(s,data,teamId,id,pos){
 const ids=availableLineup(s,data,teamId),map=s.teams[teamId].fielding,p=data.players.find(p=>p.id===id);
 if(!ids.includes(id)||!FIELD_POSITIONS.includes(pos)||!positionsOf(p).includes(pos))throw new Error('球員不具備這個守位。');
 const other=ids.find(pid=>map[pid]===pos),previous=map[id];
 if(other===id)return;
 if(other&&!positionsOf(data.players.find(p=>p.id===other)).includes(previous))throw new Error(`守位已被占用，無法直接互換。請先更換球員或使用自動打線。`);
 map[id]=pos;if(other)map[other]=previous;
}
export function chooseStarter(s,data,teamId,preferred=null){
 const roster=rosterFor(s,data,teamId).filter(p=>hasPitch(p)&&!s.condition[p.id].injury);
 const rotation=s.teams[teamId].rotation;
 if(preferred&&roster.some(p=>p.id===preferred))return preferred;
 return [...roster].sort((a,b)=>{
  const score=p=>s.condition[p.id].energy+pitchValue(p)*.3+(rotation.includes(p.id)?25:0);
  return score(b)-score(a);
 })[0]?.id;
}
function adjusted(s,p,key){const c=s.condition[p.id];return (p.ratings[key]||50)*(1+c.form*.09)*(c.energy<35?.86:1)*(1+((s.teams[teamOf(s,p)].morale??50)-50)*.001);}
export function simulateGame(s,data,awayId,homeId,options={}){
 const byId=Object.fromEntries(data.players.map(p=>[p.id,p]));
 optimizeLineup(s,data,awayId);optimizeLineup(s,data,homeId);
 const lineups=[availableLineup(s,data,awayId),availableLineup(s,data,homeId)];
 const teamIds=[awayId,homeId],score=[0,0],innings=[[],[]],index=[0,0],hits=[0,0],errors=[0,0];
 const arms=teamIds.map(id=>chooseStarter(s,data,id,id===s.teamId?options.starter:null));
 if(arms.some(p=>!p))throw new Error('無健康投手可出賽。');
 const usedArms=[new Set(),new Set()],boxB={},boxP={},moments=[];
 const startEnergy={};const pitchedPA={};
 const bstat=id=>boxB[id]??=({id,team_id:teamOf(s,byId[id]),ab:0,h:0,r:0,rbi:0,hr:0,bb:0,k:0});
 const pstat=id=>boxP[id]??=({id,team_id:teamOf(s,byId[id]),outs:0,h:0,r:0,bb:0,k:0,pitches:0});
 const changePitcher=side=>{
  const current=arms[side],own=rosterFor(s,data,teamIds[side]).filter(p=>hasPitch(p)&&!s.condition[p.id].injury&&!usedArms[side].has(p.id)&&p.id!==current);
  own.sort((a,b)=>{const val=p=>pitchValue(p)+(p.role==='SP'?-16:5)+s.condition[p.id].energy*.4;return val(b)-val(a);});
  if(own.length)arms[side]=own[0].id;
 };
 const note=(inning,half,msg,importance)=>moments.push({inning,half,text:msg,importance,score:[...score]});
 for(let inning=1;inning<=60;inning++){
  for(let side=0;side<2;side++){
   if(side===1&&inning>=9&&score[1]>score[0]){innings[1].push(null);break;}
   const defense=1-side;let outs=0,runs=0,bases=[null,null,null],paGuard=0;
   if(inning>=10)bases[1]={id:lineups[side][(index[side]+8)%9],pitcher:arms[defense]};
   const scored=(runner,batterId)=>{score[side]++;runs++;batting(s,runner.id).r++;bstat(runner.id).r++;pitching(s,runner.pitcher).r++;pstat(runner.pitcher).r++;if(batterId){batting(s,batterId).rbi++;bstat(batterId).rbi++;}};
   while(outs<3){
    if(++paGuard>200)throw new Error('單局模擬超過上限，未儲存本次結果。');
    let pid=arms[defense],pc=pstat(pid),pitcher=byId[pid];
    if(!usedArms[defense].has(pid)){usedArms[defense].add(pid);startEnergy[pid]=s.condition[pid].energy;pitching(s,pid).g++;}
    const limit=usedArms[defense].size===1?85:27;
    if(pc.pitches>=limit||s.condition[pid].energy<20){changePitcher(defense);pid=arms[defense];pitcher=byId[pid];pc=pstat(pid);if(!usedArms[defense].has(pid)){usedArms[defense].add(pid);startEnergy[pid]=s.condition[pid].energy;pitching(s,pid).g++;}}
    const bid=lineups[side][index[side]++%9],batter=byId[bid],bs=batting(s,bid),pb=pitching(s,pid),gb=bstat(bid);bs.pa++;
    const pitches=3+Math.floor(random(s)*4);pc.pitches+=pitches;pb.pitches+=pitches;pitchedPA[pid]=(pitchedPA[pid]||0)+1;
    s.condition[pid].lastPlayed=s.day;s.condition[pid].energy=clamp(startEnergy[pid]-pc.pitches*(usedArms[defense].size===1?.79:1.8),0,100);
    const stuff=adjusted(s,pitcher,'stuff'),control=adjusted(s,pitcher,'control'),movement=adjusted(s,pitcher,'movement');
    const k=clamp(.22*Math.pow(10,(stuff-adjusted(s,batter,'contact'))/115),.07,.44);
    const bb=clamp(.08*Math.pow(10,(adjusted(s,batter,'eye')-control)/105),.025,.19);
    const hr=clamp(.03*Math.pow(10,(adjusted(s,batter,'power')-movement)/90),.004,.11);
    const hit=clamp(.215+(adjusted(s,batter,'contact')-50)*.002-(movement-50)*.0008,.12,.32);
    let roll=random(s),event='out';if(roll<k)event='k';else if((roll-=k)<bb)event='bb';else if((roll-=bb)<hr)event='hr';else if((roll-=hr)<hit)event='hit';
    const runner={id:bid,pitcher:pid};const before=[...score];
    if(event==='bb'){
      bs.bb++;gb.bb++;pb.bb++;pc.bb++;
      if(bases[0]){if(bases[1]){if(bases[2])scored(bases[2],bid);bases[2]=bases[1];}bases[1]=bases[0];}bases[0]=runner;
    }else{
     bs.ab++;gb.ab++;
     if(event==='k'){outs++;pb.outs++;pc.outs++;bs.k++;gb.k++;pb.k++;pc.k++;}
     else if(event==='hr'||event==='hit'){
      bs.h++;gb.h++;pb.h++;pc.h++;hits[side]++;
      let distance=event==='hr'?4:random(s)<.2?2:random(s)<.025?3:1;
      if(distance===4){bs.hr++;gb.hr++;}
      const next=[null,null,null];
      for(let b=2;b>=0;b--)if(bases[b]){let target=b+distance;if(distance===1&&b===1&&random(s)<.55)target=3;if(distance===2&&b===0&&random(s)<.4)target=3;if(target>=3)scored(bases[b],bid);else next[target]=bases[b];}
      if(distance===4)scored(runner,bid);else next[distance-1]=runner;bases=next;
      if(distance===4)note(inning,side,`${batter.name} 轟出${score[side]-before[side]}分全壘打`,4+(inning>=7?3:0));
     }else{
      const defensePlayers=lineups[defense].map(id=>byId[id]);const avgDefense=defensePlayers.filter(p=>s.teams[teamIds[defense]].fielding?.[p.id]!=='DH').reduce((a,p)=>a+(p.ratings.defense||50)*(s.condition[p.id].energy<35?.85:1),0)/8;
      if(random(s)<clamp(.013-(avgDefense-50)*.0003,.004,.025)){
       errors[defense]++;const next=[runner,null,null];for(let b=2;b>=0;b--)if(bases[b]){if(b===2)scored(bases[b],null);else next[b+1]=bases[b];}bases=next;
      }else if(bases[0]&&outs<2&&random(s)<.16){outs+=2;pb.outs+=2;pc.outs+=2;bases[0]=null;}
      else{if(bases[2]&&outs<2&&random(s)<.25){scored(bases[2],bid);bases[2]=null;bs.ab--;gb.ab--;}outs++;pb.outs++;pc.outs++;}
     }
    }
    if(score[side]>before[side]&&before[side]<=before[defense]&&score[side]>score[defense])note(inning,side,`${batter.name} 的打席讓球隊取得領先`,inning>=7?9:5);
    if(side===1&&inning>=9&&score[1]>score[0]){note(inning,side,`${batter.name} 完成再見一擊／推進得分！`,12);break;}
   }
   innings[side].push(runs);
   if(side===1&&inning>=9&&score[1]!==score[0])break;
  }
  if(inning>=9&&score[0]!==score[1])break;
  if(inning===60)throw new Error('比賽超過延長局數上限，請重試。');
 }
 for(let side=0;side<2;side++)for(const id of lineups[side]){batting(s,id).g++;s.condition[id].energy=clamp(s.condition[id].energy-10,0,100);s.condition[id].lastPlayed=s.day;}
 const winner=score[0]>score[1]?awayId:homeId,loser=winner===awayId?homeId:awayId;
 if(!options.postseason){s.teams[winner].w++;s.teams[loser].l++;for(let side=0;side<2;side++){s.teams[teamIds[side]].rs+=score[side];s.teams[teamIds[side]].ra+=score[1-side];}}
 const game={day:s.day,away:awayId,home:homeId,score,innings,hits,errors,winner,postseason:!!options.postseason,
  moments:moments.sort((a,b)=>b.importance-a.importance).slice(0,6).sort((a,b)=>a.inning-b.inning||a.half-b.half),batters:Object.values(boxB),pitchers:Object.values(boxP),lineups};
 return game;
}
export function standings(s){return Object.entries(s.teams).sort((a,b)=>(b[1].w/(b[1].w+b[1].l||1))-(a[1].w/(a[1].w+a[1].l||1))||((b[1].rs-b[1].ra)-(a[1].rs-a[1].ra))||a[0].localeCompare(b[0]));}
function recover(s,data){for(const p of data.players){const c=s.condition[p.id];c.energy=clamp(c.energy+(hasPitch(p)?18:c.lastPlayed===s.day-1?5:16),0,100);if(c.injury)c.injury--;if(c.formDays>0){c.formDays--;if(!c.formDays)c.form=0;}}}
export function findTradeProposal(s,data,fromTeam,opponent){
 if(s.phase!=='regular'||s.day>=tradeDeadline(s))return null;
 const mine=rosterFor(s,data,fromTeam).filter(p=>!s.condition[p.id].injury),theirs=rosterFor(s,data,opponent).filter(p=>!s.condition[p.id].injury);
 if(!mine.length||!theirs.length)return null;
 const start=Math.floor(random(s)*mine.length),targetStart=Math.floor(random(s)*theirs.length);
 for(let i=0;i<Math.min(8,mine.length);i++){
  const give=mine[(start+i)%mine.length];
  const options=[...theirs].sort((a,b)=>Math.abs(tradeValue(a,s)-tradeValue(give,s))-Math.abs(tradeValue(b,s)-tradeValue(give,s)));
  for(let j=0;j<Math.min(4,options.length);j++){
   const get=options[(j+targetStart)%Math.min(4,options.length)];
   const cash=Math.max(0,Math.ceil((tradeValue(get,s)*1.05-tradeValue(give,s))*400000/50000)*50000);
   const offer={fromTeam,targetTeam:opponent,giveId:give.id,getId:get.id,cash};
   if(evaluateTrade(s,data,offer).ok)return offer;
  }
 }
 return null;
}
export function makeEvent(s,data,forcedType=null){
 const own=rosterFor(s,data,s.teamId).filter(p=>!s.condition[p.id].injury);if(!own.length)return;
 const p=own[Math.floor(random(s)*own.length)],roll=random(s);
 const type=forcedType||(roll<.10?'injury':roll<.27?'training':roll<.51?'clubhouse':roll<.65?'offfield':roll<.85?'trade_offer':roll<.95?'league_trade':'team');
 if(type==='trade_offer'||type==='league_trade'){
  const others=data.teams.filter(t=>t.id!==s.teamId),start=Math.floor(random(s)*others.length);
  for(let i=0;i<Math.min(5,others.length);i++){
   const from=type==='trade_offer'?s.teamId:others[(start+i)%others.length].id;
   const to=type==='trade_offer'?others[(start+i)%others.length].id:others[(start+i+1)%others.length].id;
   const offer=findTradeProposal(s,data,from,to);if(!offer)continue;
   const give=data.players.find(p=>p.id===offer.giveId),get=data.players.find(p=>p.id===offer.getId),a=data.teams.find(t=>t.id===from),b=data.teams.find(t=>t.id===to);
   if(type==='trade_offer')s.event={type,player:p.id,title:`交易提案：${b.zh}`,text:`${b.zh} 提議用 ${get.name} 換取本隊 ${give.name}。${offer.cash?`本隊需附加 US$${offer.cash.toLocaleString('en-US')} 遊戲現金。`:'不附加現金。'}`,offer,choices:['接受交易','拒絕，保留目前陣容']};
   else{executeTrade(s,data,offer);s.event={type,player:p.id,title:'聯盟交易消息',text:`${a.zh} 送出 ${give.name}，向 ${b.zh} 換入 ${get.name}${offer.cash?`，另付 US$${offer.cash.toLocaleString('en-US')} 遊戲現金`:''}。雙方名單已更新，不影響你的球員。`,offer,choices:['確認消息']};}
   return;
  }
 }
 if(type==='injury'||type==='clubhouse'||type==='offfield')s.event=storyEvent(s,data,s.teamId,type);
 else if(type==='training')s.event={type,player:p.id,title:`${p.name} 申請額外訓練`,text:`${p.name} 想加練找回節奏。要安排加練，還是保留體力？`,choices:['加練：手感提升，體力 −12','休息：體力 +15']};
 else if(type==='team')s.event={type,player:p.id,title:`${p.name} 提議球團恢復日`,text:`${p.name} 向教練團提議安排團隊活動，也有人希望把時間留給個別恢復。`,choices:['團隊活動：三人手感提升','個別恢復：全隊體力 +8']};
 else s.event=storyEvent(s,data,s.teamId,'clubhouse');
}

export function resolveEvent(s,data,choice){
 const e=s.event;if(!e)return;
 if(!Number.isInteger(choice)||choice<0||choice>=e.choices.length)throw new Error('請選擇事件提供的選項。');
 const status=eventChoiceStatus(s,data,e,choice);if(!status.ok)throw new Error(status.reason);
 const c=s.condition[e.player];
 if(e.type==='trade_offer'&&choice===0)executeTrade(s,data,e.offer);
 if(e.type==='offfield'){const club=s.teams[e.teamId||s.teamId];club.morale=clamp((club.morale??50)+(choice===0?3:1),0,100);s.fictionalCases??=[];s.fictionalCases.unshift({day:s.day,name:e.fictionalName,scenario:e.scenario,status:e.choices[choice]});}
 if(e.type==='clubhouse'){if(e.options)applyClubhouseChoice(s,data,e,choice);else{const club=s.teams[e.teamId||s.teamId];club.morale=clamp((club.morale??50)+(choice===0?12:6),0,100);for(const p of rosterFor(s,data,e.teamId||s.teamId))s.condition[p.id].energy=clamp(s.condition[p.id].energy+(choice===0?-4:4),0,100);}}
 if(e.type==='training'){if(choice===0){c.form=1;c.formDays=4;c.energy=clamp(c.energy-12,0,100);}else c.energy=clamp(c.energy+15,0,100);}
 if(e.type==='team'){const own=rosterFor(s,data,s.teamId);if(choice===0){const shuffled=[...own].sort((a,b)=>a.id.localeCompare(b.id));for(let i=0;i<3;i++){const p=shuffled.splice(Math.floor(random(s)*shuffled.length),1)[0];s.condition[p.id].form=1;s.condition[p.id].formDays=4;}}else for(const p of own)s.condition[p.id].energy=clamp(s.condition[p.id].energy+8,0,100);}
 if(!e.newsId)publishEvent(s,e);
 addNews(s,{day:s.day,category:'decision',teamIds:[e.teamId||s.teamId],title:`處理結果：${e.title}`,text:e.choices[choice]+(e.options?'。'+e.options[choice].description:''),playerIds:e.participants||[e.player].filter(Boolean),fictional:e.type==='offfield'});
 s.eventLog.unshift({day:s.day,title:e.title,text:e.text,choice:e.choices[choice]+(e.options?'。'+e.options[choice].description:'')});s.eventLog=s.eventLog.slice(0,40);s.event=null;
}
export function nextDay(s,data,options={}){
 if(s.phase==='finished'||s.event)return [];
 recover(s,data);for(const club of Object.values(s.teams)){club.morale??=50;club.morale+=Math.sign(50-club.morale);}
 const results=[];
 if(s.phase==='regular'){
  for(const [away,home] of s.schedule[s.day])results.push(simulateGame(s,data,away,home,options));
  s.day++;
  if(s.day>=s.schedule.length){const top=standings(s).slice(0,4).map(([id])=>id);s.playoffs={round:'semifinal',seeds:top,series:[{teams:[top[0],top[3]],wins:[0,0]},{teams:[top[1],top[2]],wins:[0,0]}],game:0};s.phase='playoffs';}
 }else{
  const po=s.playoffs;const needed=po.round==='final'?3:2;
  for(const series of po.series){if(series.wins.some(w=>w>=needed))continue;const [high,low]=series.teams;const swap=po.game%3===2;const game=simulateGame(s,data,swap?high:low,swap?low:high,{...options,postseason:true});series.wins[series.teams.indexOf(game.winner)]++;results.push(game);}
  po.game++;s.day++;
  if(po.series.every(series=>series.wins.some(w=>w>=needed))){const winners=po.series.map(series=>series.teams[series.wins.indexOf(needed)]);if(po.round==='final'){s.champion=winners[0];s.phase='finished';}else{s.playoffs={round:'final',seeds:po.seeds,series:[{teams:winners.sort((a,b)=>po.seeds.indexOf(a)-po.seeds.indexOf(b)),wins:[0,0]}],game:0};}}
 }
 settleDay(s,data,results);
 const own=results.find(g=>g.away===s.teamId||g.home===s.teamId);if(own)s.lastGame=own;
 s.history.unshift(...results.map(({batters,pitchers,lineups,...rest})=>rest));s.history=s.history.slice(0,180);
 if(s.phase!=='finished'){
  for(const p of rosterFor(s,data,s.teamId)){if(!s.condition[p.id].formDays&&random(s)<.025){s.condition[p.id].form=random(s)<.5?-1:1;s.condition[p.id].formDays=3+Math.floor(random(s)*3);}}
  if(random(s)<EVENT_RATE){makeEvent(s,data);if(s.event)publishEvent(s,s.event);}
  if(random(s)<.55){const clubs=data.teams.filter(t=>t.id!==s.teamId),id=clubs[Math.floor(random(s)*clubs.length)].id;const r=random(s);const e=storyEvent(s,data,id,r<.25?'injury':r<.85?'clubhouse':'offfield');if(e?.type==='clubhouse'){const available=e.options.map((o,i)=>i).filter(i=>eventChoiceStatus(s,data,e,i).ok),choice=available[Math.floor(random(s)*available.length)];applyClubhouseChoice(s,data,e,choice);e.text+=` 球團處理：${e.choices[choice]}。${e.options[choice].description}`;}publishEvent(s,e);}
 }
 recordDailyNews(s,data,results);
 return results;
}

// Fictional contracts and finances. USD; one contract covers the current season.
export function salaryOf(p){const value=hasPitch(p)&&!hasBat(p)?pitchValue(p):Math.max(hasBat(p)?batValue(p):0,hasPitch(p)?pitchValue(p):0);return Math.round((250000+Math.pow(Math.max(0,value-40),2)*15000+(p.role==='SP'?350000:0))/50000)*50000;}
export function payroll(s,data,teamId){return rosterFor(s,data,teamId).reduce((sum,p)=>sum+salaryOf(p),0);}
export function salaryFractionRemaining(s){const plan=s.salaryPlan||{start:0,end:seasonGames(s),fraction:1};return Math.max(0,plan.fraction*(plan.end-s.day)/Math.max(1,plan.end-plan.start));}
export function dailySalary(s,data,teamId){const plan=s.salaryPlan;return Math.round(payroll(s,data,teamId)*(plan?plan.fraction/Math.max(1,plan.end-plan.start):1/seasonGames(s)));}
export function remainingSalary(s,data,teamId){return Math.ceil(payroll(s,data,teamId)*salaryFractionRemaining(s));}
export function migrateSeason(s,data){
 const oldLength=s.schedule.length;
 if(oldLength===58&&s.phase==='regular'){
  const full=makeSchedule(data.teams.map(t=>t.id));s.schedule=[...s.schedule,...full.slice(oldLength)];
  s.salaryPlan??={start:s.day,end:SEASON_GAMES,fraction:Math.max(0,oldLength-s.day)/oldLength};
  s.scheduleUpgrade={from:oldLength,to:SEASON_GAMES,day:s.day};
 }
 s.year??=2026;s.career??=[];
 s.salaryPlan??={start:0,end:seasonGames(s),fraction:1};
 initializeNews(s,data);
 if(s.event?.type==='clubhouse'&&s.event.scenario&&!s.event.options)designClubhouseChoices(s.event,data);
 s.version=VERSION;s.ownership??={};s.tradeLog??=[];s.finance??={};
 for(const t of data.teams){
  const club=s.teams[t.id],roster=rosterFor(s,data,t.id);club.morale??=50;club.fielding??=assignFielding(club.lineup,data)||{};
  if(!s.finance[t.id]){const wages=payroll(s,data,t.id),remaining=remainingSalary(s,data,t.id);const opening=Math.ceil(remaining+20000000);s.finance[t.id]={cash:opening,openingCash:opening,budget:Math.ceil((wages*1.18+3000000)/1000000)*1000000,ticketPrice:35,income:0,salaryCost:0,operatingCost:0,tradeCash:0,ledger:[],sinceDay:s.day};}
  club.rotation=club.rotation.filter(id=>roster.some(p=>p.id===id&&hasPitch(p)));
 }
 for(const p of data.players){s.condition[p.id]??={energy:100,injury:0,form:0,formDays:0};if(s.condition[p.id].lastPlayed==null&&s.day>0)s.condition[p.id].lastPlayed=s.day-1;}
 // Freeze historical box-score affiliations before any trades occur.
 if(s.lastGame){for(const b of s.lastGame.batters||[])b.team_id??=s.lastGame.lineups?.[0]?.includes(b.id)?s.lastGame.away:s.lastGame.home;for(const p of s.lastGame.pitchers||[])p.team_id??=data.players.find(q=>q.id===p.id)?.team_id;}
 return s;
}
function settleDay(s,data,games){
 const date=s.day;const byTeam=new Map();for(const g of games){byTeam.set(g.away,{g,home:false});byTeam.set(g.home,{g,home:true});}
 for(const t of data.teams){const f=s.finance[t.id],match=byTeam.get(t.id);const wage=date<=seasonGames(s)?dailySalary(s,data,t.id):0;let income=0,cost=0,attendance=0;
  if(match){const standing=s.teams[t.id],win=standing.w/(standing.w+standing.l||1);attendance=match.home?Math.round(clamp((24000+win*6000)*Math.pow(35/f.ticketPrice,.6),12000,45000)):0;income=150000+attendance*(f.ticketPrice+12);cost=match.home?180000:75000;}
  f.cash+=income-wage-cost;f.income+=income;f.salaryCost+=wage;f.operatingCost+=cost;
  f.ledger.unshift({day:date,type:'operations',label:match?(match.home?'主場賽事':'客場賽事'):'休賽日',income,salary:wage,cost,attendance,net:income-wage-cost});f.ledger=f.ledger.slice(0,90);
 }
}
export function setTicketPrice(s,teamId,price){if(!Number.isInteger(price)||price<15||price>80)throw new Error('票價需介於 US$15–80。');s.finance[teamId].ticketPrice=price;}
export function tradeValue(p,s){const raw=hasPitch(p)&&!hasBat(p)?pitchValue(p):Math.max(hasBat(p)?batValue(p):0,hasPitch(p)?pitchValue(p):0);const age=playerAge(s,p);return Math.max(5,(raw-35)*4*(age<=26?1.15:age>=35?.8:1)-salaryOf(p)/1000000*.3);}
export function evaluateTrade(s,data,offer){
 const {targetTeam,giveId,getId}=offer,cash=Number(offer.cash||0),my=offer.fromTeam||s.teamId;const give=data.players.find(p=>p.id===giveId),get=data.players.find(p=>p.id===getId);const reasons=[];
 if(s.phase!=='regular'||s.day>=tradeDeadline(s))reasons.push(`交易截止：僅例行賽前 ${tradeDeadline(s)} 日可交易。`);
 if(!s.teams[targetTeam]||targetTeam===my||!give||!get||giveId===getId||teamOf(s,give)!==my||teamOf(s,get)!==targetTeam)return {ok:false,reasons:['球員所屬已改變，請重新選擇。'],neededCash:0};
 if(!Number.isSafeInteger(cash)||cash<0||cash>20000000)return {ok:false,reasons:['交易現金需為 0–2,000 萬美元的整數。'],neededCash:0};
 if(s.condition[giveId].injury||s.condition[getId].injury)reasons.push('此版本不開放交易傷兵。');
 if(s.event?.type==='clubhouse'&&s.event.participants?.some(id=>id===giveId||id===getId))reasons.push('請先處理更衣室事件，再交易相關球員。');
 const delta=salaryOf(get)-salaryOf(give),myPayroll=payroll(s,data,my)+delta,otherPayroll=payroll(s,data,targetTeam)-delta;
 const myRemaining=Math.ceil(myPayroll*salaryFractionRemaining(s));
 if(myPayroll>s.finance[my].budget)reasons.push('交易後本季薪資超過你的薪資預算。');
 if(otherPayroll>s.finance[targetTeam].budget)reasons.push('對方球隊無法容納交易後薪資。');
 if(s.finance[my].cash-cash<myRemaining)reasons.push('支付現金後不足以保留剩餘球季薪資。');
 const offered=tradeValue(give,s)+cash/400000,wanted=tradeValue(get,s)*1.05;
 const neededCash=Math.max(0,Math.ceil((wanted-tradeValue(give,s))*400000/50000)*50000);
 if(offered<wanted)reasons.push(`對方認為價值不足，這組球員約需附加 US$${neededCash.toLocaleString('en-US')}。`);
 for(const id of [my,targetTeam]){const outgoing=id===my?give:get,incoming=id===my?get:give;const roster=rosterFor(s,data,id).filter(p=>p.id!==outgoing.id).concat(incoming);if(!assignFielding(roster.filter(p=>hasBat(p)&&!s.condition[p.id].injury).map(p=>p.id),data)||!roster.some(p=>hasPitch(p)&&!s.condition[p.id].injury))reasons.push(id===my?'本隊交易後無法組成完整守備陣容。':'對方交易後無法組成完整守備陣容。');}
 return {ok:reasons.length===0,reasons,neededCash,delta,myPayroll,otherPayroll,remainingCash:s.finance[my].cash-cash,myRemaining,offered,wanted};
}
export function executeTrade(s,data,offer){
 const result=evaluateTrade(s,data,offer);if(!result.ok)throw new Error(result.reasons.join('\n'));
 const {giveId,getId,targetTeam}=offer,cash=Number(offer.cash||0),my=offer.fromTeam||s.teamId;
 s.ownership[giveId]=targetTeam;s.ownership[getId]=my;
 s.finance[my].cash-=cash;s.finance[my].tradeCash-=cash;s.finance[targetTeam].cash+=cash;s.finance[targetTeam].tradeCash+=cash;
 for(const id of [my,targetTeam]){
  const outgoing=id===my?giveId:getId,incoming=id===my?getId:giveId;
  const ids=s.teams[id].lineup.map(pid=>pid===outgoing?incoming:pid);
  const assignment=assignFielding(ids,data,s.teams[id].fielding);
  if(assignment){s.teams[id].lineup=ids;s.teams[id].fielding=assignment;}else{s.teams[id].lineup=autoLineup(rosterFor(s,data,id),s.condition);s.teams[id].fielding=assignFielding(s.teams[id].lineup,data);}
  s.teams[id].rotation=rosterFor(s,data,id).filter(hasPitch).sort((a,b)=>(b.role==='SP')-(a.role==='SP')||pitchValue(b)-pitchValue(a)).slice(0,5).map(p=>p.id);
 }
 s.tradeLog.unshift({day:s.day,fromTeam:my,giveId,getId,targetTeam,cash});
 const name=id=>data.players.find(p=>p.id===id).name,club=id=>data.teams.find(t=>t.id===id).zh;
 addNews(s,{category:'trade',teamIds:[my,targetTeam],playerIds:[giveId,getId],title:`交易成交：${club(my)} ↔ ${club(targetTeam)}`,text:`${club(my)} 送出 ${name(giveId)}，換入 ${club(targetTeam)} 的 ${name(getId)}${cash?`，另付 US$${cash.toLocaleString('en-US')} 遊戲現金`:''}。`});return result;
}

// Season newspaper: snapshots survive trades, save reloads and the short game history.
export function addNews(s,item){
 s.news??=[];s.newsSeq=(s.newsSeq||0)+1;
 const entry={id:s.newsSeq,day:s.day,category:'clubhouse',teamIds:[],playerIds:[],...item};s.news.unshift(entry);return entry.id;
}
function publishEvent(s,e){
 if(!e)return;
 e.newsId=addNews(s,{category:e.type==='trade_offer'?'proposal':e.type==='league_trade'?'trade':e.type==='team'||e.type==='training'?'training':e.type,teamIds:e.offer?[e.offer.fromTeam,e.offer.targetTeam]:[e.teamId||s.teamId],playerIds:e.participants||[e.player].filter(Boolean),title:e.title,text:e.text,fictional:e.type==='offfield'});
}
export const STORY_SCENARIOS={
 clubhouse:['argument','meeting','coach','role','music','welcome','prank','bus'],
 injury:['bathroom','luggage','cooking','sneeze','pet','sleep'],
 offfield:['dui','domestic']
};
function storyEvent(s,data,teamId,type,forcedScenario){
 const roster=rosterFor(s,data,teamId).filter(p=>!s.condition[p.id].injury),p=roster[Math.floor(random(s)*roster.length)];
 if(!p)return null;
 const other=roster.filter(q=>q.id!==p.id),q=other[Math.floor(random(s)*other.length)]||p;
 const list=STORY_SCENARIOS[type],scenario=forcedScenario||list[Math.floor(random(s)*list.length)];
 const e={type,teamId,player:p.id,participants:[p.id],scenario};
 if(type==='offfield'){
  // These people are explicitly invented and have no link to real roster IDs.
  const names=['周柏岳','林曜辰','陳以衡','許澤安'];const name=names[Math.floor(random(s)*names.length)]+'（虛構人物）';
  Object.assign(e,{player:null,participants:[],fictionalName:name,title:scenario==='dui'?`場外紀律：${name} 酒駕事件`:`場外紀律：${name} 涉家庭暴力調查`,text:scenario==='dui'?`架空培訓球員 ${name} 酒後駕車，球團已停止其培訓活動。本事件與真實球員無關。球團需要決定後續的紀律教育及交通安排。`:`架空培訓球員 ${name} 涉入家庭暴力調查，已停止其培訓活動，並配合調查與提供當事人支持資源。本事件與真實球員無關，調查結果尚未確定。`,choices:['停訓並安排外部專業協助：氣氛 +3','維持停訓、配合調查與定期回報：氣氛 +1']});return e;
 }
 if(type==='injury'){
  const stories={bathroom:['浴室滑倒','在飯店浴室滑倒，腳踝扭傷'],luggage:['搬行李拉傷','搬行李箱時拉傷背部'],cooking:['備餐小意外','在住處切水果時割傷手指'],sneeze:['打噴嚏閃到腰','打噴嚏時突然閃到腰'],pet:['追寵物扭傷','追逐跑出門的寵物時扭傷手腕'],sleep:['落枕無法轉頭','睡醒後嚴重落枕，暫時無法正常訓練']};
  const [title,text]=stories[scenario];const days=3+Math.floor(random(s)*5);
  const remaining=roster.filter(x=>x.id!==p.id);
  const viable=!!assignFielding(remaining.filter(hasBat).map(x=>x.id),data)&&remaining.some(hasPitch);
  if(viable)s.condition[p.id].injury=days;else s.condition[p.id].energy=clamp(s.condition[p.id].energy-8,0,100);
  return {...e,title:`${p.name}：${title}`,text:`${p.name} ${text}。${viable?`醫療團隊建議休養 ${days} 個比賽日，健康球員將自動遞補。`:'檢查後無須進傷兵名單，體力 −8，持續觀察。'}`,choices:['安排醫療照護並追蹤恢復']};
 }
 const stories={argument:[`${p.name} 與 ${q.name} 在更衣室吵架`,`${p.name} 與 ${q.name} 對場上配合有不同看法，賽後在更衣室提高音量爭論。隊友希望教練團出面協調。`],meeting:[`${p.name} 召開全隊會議`,`${p.name} 主動召集隊友，在更衣室討論近期表現與接下來的目標。大家等你決定會議要談多深。`],coach:[`${p.name} 與教練意見不合`,`${p.name} 對教練安排的打擊或投球訓練提出異議，雙方在訓練場爭論。需要釐清溝通方式與球員角色。`],role:[`${p.name} 希望增加出賽機會`,`${p.name} 走進教練室，要求說明未來的輪休與出賽規劃。${q.name} 願意協助溝通。`],music:[`${p.name} 與 ${q.name} 的音樂之爭`,`${p.name} 想在更衣室播放搖滾樂，${q.name} 卻希望安靜準備。兩人為音量互不相讓。`],welcome:[`${p.name} 主動帶隊友融入球隊`,`${p.name} 邀請 ${q.name} 與幾名隊友一起聚餐，提議讓全隊更熟悉彼此。`],prank:[`${p.name} 的玩笑讓 ${q.name} 不開心`,`${p.name} 把 ${q.name} 的置物櫃貼滿便利貼，原本想活絡氣氛，對方卻覺得準備時間被打斷。`],bus:[`${p.name} 在巴士上發起球隊問答`,`${p.name} 在客場巴士上發起問答，${q.name} 一路答錯成為笑點。隊友希望把這份熱絡延續到球場。`]};
 const [title,text]=stories[scenario];return designClubhouseChoices({...e,participants:['meeting','coach'].includes(scenario)?[p.id]:[p.id,q.id],title:`更衣室：${title}`,text},data);
}
// Explicit scenario entry point for deterministic content checks.
export function makeStoryEvent(s,data,teamId,type,scenario){return storyEvent(s,data,teamId,type,scenario);}
function recordDailyNews(s,data,games){
 if(!games.length)return;
 const club=id=>data.teams.find(t=>t.id===id).zh;
 addNews(s,{category:'scores',teamIds:games.flatMap(g=>[g.away,g.home]),title:`第 ${s.day} 日全聯盟賽果`,text:`${games.length} 場比賽結束。`,scores:games.map(g=>({away:g.away,home:g.home,score:g.score,winner:g.winner,postseason:g.postseason}))});
 const bats=games.flatMap(g=>g.batters).sort((a,b)=>b.hr-a.hr||b.h-a.h||b.rbi-a.rbi),best=bats[0];
 if(best){const p=data.players.find(p=>p.id===best.id);addNews(s,{category:'performance',teamIds:[best.team_id],playerIds:[p.id],title:`單日焦點：${p.name} ${best.hr>=2?`${best.hr} 轟爆發`:best.h>=4?`${best.h} 安猛打`:`貢獻 ${best.rbi} 分打點`}`,text:`${club(best.team_id)} 的 ${p.name} 今日 ${best.ab} 打數 ${best.h} 安打、${best.hr} 支全壘打、${best.rbi} 分打點。`});}
 const biggest=[...games].sort((a,b)=>Math.abs(b.score[0]-b.score[1])-Math.abs(a.score[0]-a.score[1]))[0];
 if(Math.abs(biggest.score[0]-biggest.score[1])>=8)addNews(s,{category:'performance',teamIds:[biggest.away,biggest.home],title:`大比分之戰：${club(biggest.winner)} 拿下勝利`,text:`${club(biggest.away)} ${biggest.score[0]}：${biggest.score[1]} ${club(biggest.home)}。`});
 if(s.day===seasonGames(s))addNews(s,{category:'milestone',teamIds:s.playoffs.seeds,title:'例行賽落幕，四強名單出爐',text:s.playoffs.seeds.map(club).join('、')+' 晉級季後賽。'});
 if(s.champion)addNews(s,{category:'milestone',teamIds:[s.champion],title:`${club(s.champion)} 奪下總冠軍`,text:'本季最後一戰落幕，冠軍球團正式誕生。'});
}
function initializeNews(s,data){
 if(s.news)return;
 s.news=[];s.newsSeq=0;s.newsSinceDay=s.day;
 for(const event of [...(s.eventLog||[])].reverse())addNews(s,{day:event.day,category:'decision',teamIds:[s.teamId],title:event.title,text:event.text+' 處理：'+event.choice});
 const byDay=new Map();for(const game of [...(s.history||[])].reverse()){const day=game.day+1;if(!byDay.has(day))byDay.set(day,[]);byDay.get(day).push(game);}
 for(const [day,games] of byDay)addNews(s,{day,category:'scores',teamIds:games.flatMap(g=>[g.away,g.home]),title:`第 ${day} 日已留存賽果`,text:'由舊存檔保留的賽事補入；更新前未保留的新聞無法回溯。',scores:games.map(g=>({away:g.away,home:g.home,score:g.score,winner:g.winner,postseason:g.postseason}))});
 if(s.event)publishEvent(s,s.event);
}

// Scenario-specific decisions. Every displayed consequence is applied by the engine.
function designClubhouseChoices(e,data){
 const p=e.participants?.[0]||e.player,q=e.participants?.[1]||p;
 const name=id=>data.players.find(p=>p.id===id)?.name||'球員';
 const player=(id,energy=0,form=0,days=0)=>({id,energy,form,days});
 const option=(label,morale,teamEnergy=0,players=[],cost=0)=>({label,morale,teamEnergy,players,cost});
 const both=(energy,form=0,days=0)=>[...new Set([p,q])].map(id=>player(id,energy,form,days));
 const catalog={
 argument:[option('讓兩人面對面檢討配合',5,0,both(-8,1,2)),option(`要求 ${name(p)} 道歉，確立紀律`,9,0,[player(p,0,-1,3)]),option('先分開冷靜，今天取消檢討',-6,6)],
 meeting:[option(`授權 ${name(p)} 主持閉門會議`,9,-6,[player(p,0,1,3)]),option('教練帶全隊做影片檢討',4,-10,[player(p,0,1,5)]),option('把會議延後，今天先恢復體力',-4,12)],
 coach:[option('支持教練的原定訓練，要求照表執行',8,0,[player(p,-4,-1,3)]),option(`替 ${name(p)} 設計個別訓練`,-3,0,[player(p,-12,1,4)]),option('暫停爭論，讓球員休息一天',-5,0,[player(p,20)])],
 role:[option(`安排 ${name(p)} 專項加練爭取機會`,2,0,[player(p,-14,1,4)]),option(`請 ${name(q)} 陪同說明輪休規劃`,7,0,both(-6)),option('維持競爭原則，不做出賽承諾',4,0,[player(p,0,-1,2)])],
 music:[option('設置安靜準備時段，請大家戴耳機',7,0,[player(p,0,-1,1)]),option('每天由不同球員輪流選歌',4,-4,both(0,1,2)),option('自費改善休息區，分開音樂與安靜空間',10,3,[],40000)],
 welcome:[option('球團買單，安排全隊聚餐',11,-5,[],60000),option(`讓 ${name(p)} 與 ${name(q)} 小組聚餐`,4,0,both(-6,1,3)),option('把聚餐留到休賽日，今晚先休息',-2,10)],
 prank:[option(`請 ${name(p)} 清理置物櫃並道歉`,8,0,[player(p,-8),player(q,0,1,2)]),option('把惡作劇改成自願參加的小活動',4,-5,both(0,1,2)),option('即刻禁止更衣室惡作劇',9,0,[player(p,0,-1,3)])],
 bus:[option('讓問答繼續，大家一起參與',7,-6,both(0,1,2)),option('改成戰術問答，由教練帶討論',3,-9,[player(p,0,1,4)]),option('結束活動，把車程留給睡眠',-3,12)]
 };
 const options=catalog[e.scenario];if(!options)return e;
 const signed=n=>(n>0?'+':'−')+Math.abs(n);
 for(const o of options){const parts=[`球隊氣氛 ${signed(o.morale)}`];if(o.teamEnergy)parts.push(`全隊體力 ${signed(o.teamEnergy)}`);for(const x of o.players){if(x.energy)parts.push(`${name(x.id)} 體力 ${signed(x.energy)}`);if(x.form)parts.push(`${name(x.id)} ${x.form>0?'火熱':'低潮'} ${x.days} 日`);}if(o.cost)parts.push(`支出 US$${o.cost.toLocaleString('en-US')}`);o.description=parts.join('；');}
 e.options=options;e.choices=options.map(o=>o.label);return e;
}
export function eventChoiceStatus(s,data,e,index){
 const o=e?.options?.[index];if(!o)return {ok:true};const teamId=e.teamId||s.teamId;
 if(o.cost&&s.finance[teamId].cash-o.cost<remainingSalary(s,data,teamId))return {ok:false,reason:'可動用現金不足，需保留剩餘球季薪資。'};
 if(o.players.some(x=>!s.condition[x.id]||!rosterFor(s,data,teamId).some(p=>p.id===x.id)))return {ok:false,reason:'相關球員已離隊，請選擇全隊處理方案。'};
 return {ok:true};
}
function applyClubhouseChoice(s,data,e,index){
 const o=e.options[index],teamId=e.teamId||s.teamId,club=s.teams[teamId];
 club.morale=clamp((club.morale??50)+o.morale,0,100);
 for(const p of rosterFor(s,data,teamId)){const c=s.condition[p.id];c.energy=clamp(c.energy+o.teamEnergy,0,100);}
 for(const x of o.players){const c=s.condition[x.id];c.energy=clamp(c.energy+x.energy,0,100);if(x.form){c.form=x.form;c.formDays=x.days+1;}}
 if(o.cost){const f=s.finance[teamId];f.cash-=o.cost;f.operatingCost+=o.cost;f.ledger.unshift({day:s.day,type:'clubhouse',label:e.choices[index],income:0,salary:0,cost:o.cost,attendance:0,net:-o.cost});f.ledger=f.ledger.slice(0,90);}
}

// Franchise continuity. The base snapshot stays immutable; evolving rosters
// are saved with the franchise and rehydrated before loading player IDs.
export const playerAge=(s,p)=>(s.year||2026)-Number(p.birth_date?.slice(0,4)||1998);
export function seasonData(base,s){return s?.playerPool?{...base,players:s.playerPool}:base;}
export const overall=p=>Math.max(hasBat(p)?batValue(p):0,hasPitch(p)?pitchValue(p):0);
function rookie(s,template,teamId,year,serial){
 const pick=xs=>xs[Math.floor(random(s)*xs.length)];
 const surname=pick(['林','陳','吳','張','黃','李','王','劉','楊','周','許','郭','蔡','鄭','謝','江']);
 const first=pick(['宇','柏','承','子','昱','宥','俊','奕','澤','冠','哲','以','景','恩','睿','曜']);
 const last=pick(['安','翔','恩','辰','廷','豪','宇','軒','凱','宏','霖','佑','睿','衡','翰','傑']);
 const age=18+Math.floor(random(s)*5),ratings={};
 for(const key of Object.keys(template.ratings))ratings[key]=clamp(36+Math.floor(random(s)*17),20,80);
 const id=`sim:${year}:${teamId}:${serial}`;
 return {id,name:`${surname}${first}${last}（虛構新人）`,team_id:teamId,position:template.position,positions:[...positionsOf(template)],role:template.role,ratings,birth_date:`${year-age}-07-01`,bats:template.bats||'R',throws:template.throws||'R',jersey_number:String(10+Math.floor(random(s)*80)),status:'Active',simulated:true,rookieYear:year,developmentPotential:56+Math.floor(random(s)*20)};
}
export function advanceSeason(previous,base){
 if(previous.phase!=='finished'||!previous.champion)throw new Error('請先完成本季冠軍賽，再進入下一季。');
 // Work on a clone: failures must leave the completed season intact.
 const old=structuredClone(previous),data=seasonData(base,old),year=(old.year||2026)+1;
 const changes=[],retirees=[],newcomers=[],players=[];let serial=0;
 const clubName=id=>base.teams.find(t=>t.id===id).zh;
 for(const original of data.players){
  const p=structuredClone(original),teamId=teamOf(old,p),age=year-Number(p.birth_date?.slice(0,4)||1998);p.team_id=teamId;
  const retireChance=age>=45?1:age>=37?Math.min(.85,.10+(age-37)*.09):0;
  if(retireChance&&random(old)<retireChance){
   retirees.push({id:p.id,name:p.name,teamId,age});const next=rookie(old,p,teamId,year,++serial);players.push(next);newcomers.push({id:next.id,name:next.name,teamId,age:year-Number(next.birth_date.slice(0,4)),position:positionsOf(next).join('/')});continue;
  }
  const before=overall(p),deltas={};p.developmentPotential??=clamp(Math.round(before)+4+Math.floor(random(old)*9),45,80);
  for(const [key,value] of Object.entries(p.ratings)){
   let delta;if(age<=25)delta=Math.floor(random(old)*4);else if(age<=30)delta=Math.floor(random(old)*3)-1;else if(age<=34)delta=-Math.floor(random(old)*3);else delta=-1-Math.floor(random(old)*4);
   if(age<=25&&value>=p.developmentPotential)delta=Math.min(0,delta);
   if(key==='speed'&&age>=31)delta=Math.min(delta,-1);
   const next=clamp(value+delta,20,80);p.ratings[key]=next;deltas[key]=next-value;
  }
  players.push(p);changes.push({id:p.id,name:p.name,teamId,age,before:Math.round(before),after:Math.round(overall(p)),deltas});
 }
 // Keep every club supplied with young talent without unbounded roster growth.
 for(const t of base.teams){
  const pool=players.filter(p=>p.team_id===t.id),source=data.players.filter(p=>teamOf(old,p)===t.id);
  for(let i=0;i<2&&pool.length<42;i++){
   const candidates=source.filter(i===0?hasBat:hasPitch),template=candidates[Math.floor(random(old)*candidates.length)];
   if(!template)throw new Error(`${t.zh} 缺少新人守位範本。`);
   const next=rookie(old,template,t.id,year,++serial);pool.push(next);players.push(next);newcomers.push({id:next.id,name:next.name,teamId:t.id,age:year-Number(next.birth_date.slice(0,4)),position:positionsOf(next).join('/')});
  }
 }
 const nextData={...base,players},next=makeSeason(nextData,old.teamId,old.rng);
 next.year=year;next.playerPool=players;next.createdAt=previous.createdAt;
 const ranked=standings(old),rank=ranked.findIndex(([id])=>id===old.teamId)+1;
 const leaders=Object.entries(old.batting).filter(([id])=>data.players.some(p=>p.id===id)).sort((a,b)=>b[1].hr-a[1].hr).slice(0,5).map(([id,stats])=>({id,name:data.players.find(p=>p.id===id).name,hr:stats.hr,avg:stats.ab?Number((stats.h/stats.ab).toFixed(3)):0}));
 next.career=[...(old.career||[]),{year:old.year||2026,champion:old.champion,teamId:old.teamId,rank,record:{w:old.teams[old.teamId].w,l:old.teams[old.teamId].l},games:seasonGames(old),standings:ranked.map(([id,t])=>({id,w:t.w,l:t.l,rs:t.rs,ra:t.ra})),leaders,endingCash:old.finance[old.teamId].cash}];
 for(const t of base.teams){
  const f=next.finance[t.id],previousCash=old.finance[t.id].cash,wages=payroll(next,nextData,t.id),grant=Math.max(0,Math.ceil(wages+20000000-previousCash));
  f.openingCash=previousCash;f.cash=previousCash+grant;f.income=grant;f.ticketPrice=old.finance[t.id].ticketPrice;f.ledger=[{day:0,type:'funding',label:`${year} 球季董事會補助`,income:grant,salary:0,cost:0,attendance:0,net:grant}];
 }
 next.offseason={from:old.year||2026,to:year,changes,retirees,newcomers};
 addNews(next,{category:'milestone',teamIds:[next.teamId],title:`${year} 新球季開幕`,text:`${clubName(old.champion)} 以衛冕冠軍身分迎接新球季。全聯盟 ${retirees.length} 人模擬退役、${newcomers.length} 位虛構新人加入。球員年齡與能力已更新；前季交易後的所屬延續。`});
 for(const t of base.teams){const retired=retirees.filter(p=>p.teamId===t.id),fresh=newcomers.filter(p=>p.teamId===t.id);if(retired.length||fresh.length)addNews(next,{category:'milestone',teamIds:[t.id],title:`${clubName(t.id)} 休賽季名單異動`,text:`${retired.length?'模擬退役：'+retired.map(p=>p.name+'（'+p.age+'歲）').join('、')+'。':''}新人報到：${fresh.map(p=>p.name+' · '+p.position).join('、')}。`});}
 return next;
}
