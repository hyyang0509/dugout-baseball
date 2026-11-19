// DUGOUT simulation v4. Seeded randomness, browser-independent engine.
import {STORIES,STORY_BY_ID,RARITY_WEIGHT,RARITY_LABEL,traitsOf,TRAIT_LABELS,TRAIT_HINTS} from './stories.js?v=18';
export {STORIES,RARITY_LABEL,TRAIT_LABELS,TRAIT_HINTS};
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
 if(ids.length!==30)return smallLeagueSchedule(ids);
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
// Round robin for smaller leagues, with Euler orientation balancing home/away.
function smallLeagueSchedule(ids){
 if(ids.length<4||ids.length%2||new Set(ids).size!==ids.length)throw new Error('聯盟需有至少四支且偶數支不同球隊。');
 const ring=[...ids],rounds=[];
 for(let d=0;d<ids.length-1;d++){rounds.push(Array.from({length:ids.length/2},(_,i)=>[ring[i],ring.at(-1-i)]));ring.splice(1,0,ring.pop());}
 const days=Array.from({length:SEASON_GAMES},(_,i)=>rounds[i%rounds.length].map(pair=>[...pair]));
 const n=ids.length,adj=Array.from({length:n+1},()=>[]),edges=[],index=new Map(ids.map((id,i)=>[id,i]));
 function add(a,b,pair){const id=edges.length;edges.push({a,b,pair,used:false});adj[a].push(id);adj[b].push(id);}
 for(const day of days)for(const pair of day)add(index.get(pair[0]),index.get(pair[1]),pair);
 for(let i=0;i<n;i++)add(i,n,null);
 const stack=[{v:n}],tour=[];
 while(stack.length){const v=stack.at(-1).v;while(adj[v].length&&edges[adj[v].at(-1)].used)adj[v].pop();if(!adj[v].length)tour.push(stack.pop());else{const id=adj[v].pop(),e=edges[id];e.used=true;stack.push({v:e.a===v?e.b:e.a,edge:id});}}
 tour.reverse();for(let i=1;i<tour.length;i++){const e=edges[tour[i].edge];if(e.pair)e.pair.splice(0,2,ids[tour[i-1].v],ids[tour[i].v]);}
 return days;
}
export const FIELD_POSITIONS=['C','1B','2B','3B','SS','LF','CF','RF','DH'];
export const teamOf=(s,p)=>s.ownership?.[p.id]||p.team_id;
export const rosterFor=(s,data,id)=>data.players.filter(p=>teamOf(s,p)===id);
// ---- Positions: primary + familiar secondary spots. Every batter can also DH.
// Secondary spots follow the defensive spectrum; MLB keeps its observed positions too.
const DEF_SPOTS=['C','1B','2B','3B','SS','LF','CF','RF'];
const SECONDARY={C:['1B'],'1B':['LF','RF'],'2B':['SS','3B'],'3B':['1B','2B'],SS:['2B','3B'],LF:['RF','1B'],CF:['LF','RF'],RF:['LF','1B'],DH:['1B']};
// Defensive cost of a move: harder moves (toward C/SS/CF) cost more.
const MOVE_COST={C:12,SS:6,CF:6,'2B':4,'3B':3,'1B':1,LF:1,RF:1};
export function idHash(id,salt=''){let h=2166136261;for(const ch of String(id)+'|'+salt){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function pickPrimary(p,options){
 // Spread generic IF/OF listings across spots: mostly a fixed per-player roll, nudged by range (defense + speed).
 const center=100+(LEAGUE_SCALE[p.league]?.shift||0),r=p.ratings;
 const roll=idHash(p.id,'primary')%100+((r.defense||50)+(r.speed||50)-center)*2.5;
 const infield=options.some(x=>['1B','2B','3B','SS'].includes(x));
 const order=infield?(roll>=75?['SS','2B','3B','1B']:roll>=50?['2B','SS','3B','1B']:roll>=25?['3B','1B','2B','SS']:['1B','3B','2B','SS']):(roll>=67?['CF','RF','LF']:roll>=33?['RF','LF','CF']:['LF','RF','CF']);
 return order.find(x=>options.includes(x))||options[0];
}
const positionMemo=new WeakMap();
export function positionProfile(p){
 let v=positionMemo.get(p);if(v)return v;
 if(!hasBat(p)){v={primary:'P',secondary:[],list:p.positions?.length?[...p.positions]:['P']};positionMemo.set(p,v);return v;}
 const listed=(p.positions||[p.position]).filter(x=>DEF_SPOTS.includes(x)||x==='DH');
 let primary=p.position;const specific=DEF_SPOTS.includes(primary)||primary==='DH';
 if(!specific){const fieldOpts=listed.filter(x=>DEF_SPOTS.includes(x));primary=fieldOpts.length?pickPrimary(p,fieldOpts):'DH';}
 // Specific listings keep every recorded spot; generic IF/OF group listings only keep the chosen spot.
 const observed=specific?listed.filter(x=>x!=='DH'&&x!==primary):[];
 const secondary=[...new Set([...observed,...(SECONDARY[primary]||[])])].filter(x=>x!==primary&&x!=='DH');
 v={primary,secondary,list:[...new Set([primary,...secondary,'DH'])]};positionMemo.set(p,v);return v;
}
export const positionsOf=p=>positionProfile(p).list;
/** Positions shown to the player: primary first, DH only when it is the primary job. */
export const positionLabel=p=>{if(!hasBat(p))return p.role||'P';const v=positionProfile(p);return v.secondary.length?`${v.primary}（${v.secondary.join('/')}）`:v.primary;};
export const primaryPosition=p=>positionProfile(p).primary;
/** Fielding rating at a spot: full at primary, small penalty at familiar spots, large when out of position. */
export function defenseAt(p,pos){
 const d=p.ratings.defense||45;if(pos==='DH')return null;const v=positionProfile(p);
 if(pos===v.primary)return d;if(v.secondary.includes(pos))return d-Math.ceil((MOVE_COST[pos]||2)/2);return d-10-(MOVE_COST[pos]||2);
}
const OVR_DEF_WEIGHT={C:.3,SS:.3,CF:.28,'2B':.25,'3B':.22,LF:.15,RF:.17,'1B':.12};
/** Overall rating shown to players: hitting plus fielding at the primary spot, or pitching. */
export function ovr(p){
 const bat=hasBat(p)?(()=>{const pos=primaryPosition(p);if(pos==='DH')return batValue(p)-2;const w=OVR_DEF_WEIGHT[pos]??.15;return batValue(p)*(1-w)+(p.ratings.defense||45)*w;})():0;
 const arm=hasPitch(p)?(p.role==='SP'?pitchValue(p)*.92+(p.ratings.stamina||50)*.08:pitchValue(p)):0;
 return Math.round(Math.max(bat,arm));
}
/** Development ceiling: fixed per player, only meaningful for young players. */
export function developmentCeiling(p){return p.developmentPotential??clamp(Math.round(overall(p))+4+idHash(p.id,'pot')%9,45,80);}
export function potential(p,s){
 const now=ovr(p),age=playerAge(s,p),room=Math.max(0,developmentCeiling(p)-overall(p));
 return Math.round(now+(age<=24?room:age<=27?room*.5:0));
}
export function assignFielding(ids,data,preferred={},scores={},opts={}){
 const byId=Object.fromEntries(data.players.map(p=>[p.id,p]));
 const can=(id,pos)=>positionsOf(byId[id]).includes(pos)||(opts.emergency&&pos!=='C'&&hasBat(byId[id]));
 const fitScore=(id,pos)=>(scores[id]??batValue(byId[id]))-(pos==='DH'||pos===primaryPosition(byId[id])?0:positionsOf(byId[id]).includes(pos)?3:12);
 const assigned={};
 const slots=[...FIELD_POSITIONS].sort((a,b)=>ids.filter(id=>can(id,a)).length-ids.filter(id=>can(id,b)).length);
 function place(pos,seen){
  const candidates=ids.filter(id=>can(id,pos)).sort((a,b)=>(preferred[b]===pos)-(preferred[a]===pos)||fitScore(b,pos)-fitScore(a,pos));
  for(const id of candidates){if(seen.has(id))continue;seen.add(id);const old=assigned[id];if(!old||place(old,seen)){assigned[id]=pos;return true;}}
  return false;
 }
 for(const pos of slots)if(!place(pos,new Set()))return opts.emergency||opts.strict?null:assignFielding(ids,data,preferred,scores,{emergency:true});
 // Without manager preferences, swap pairs while it improves total fielding (keeps a gold-glove SS off DH).
 if(!Object.keys(preferred).length){
  const value=(id,pos)=>pos==='DH'?0:(defenseAt(byId[id],pos)??0)*(1+(OVR_DEF_WEIGHT[pos]||.15));
  const chosen=Object.keys(assigned);
  for(let round=0,better=true;better&&round<20;round++){better=false;
   for(let i=0;i<chosen.length;i++)for(let j=i+1;j<chosen.length;j++){const a=chosen[i],b=chosen[j],pa=assigned[a],pb=assigned[b];
    if(!can(a,pb)||!can(b,pa))continue;
    if(value(a,pb)+value(b,pa)>value(a,pa)+value(b,pb)+.5){assigned[a]=pb;assigned[b]=pa;better=true;}}
  }
 }
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
 return migrateSeason({league:data.league||'MLB',...(data.world?{world:true}:{}),version:VERSION,dataVersion:data.generated_at,teamId,rng:(seed>>>0)||1234567,day:0,phase:'regular',schedule:makeSchedule(data.teams.map(t=>t.id)),teams,condition,batting:{},pitching:{},history:[],lastGame:null,event:null,eventLog:[],playoffs:null,champion:null,createdAt:new Date().toISOString()},data);
}
function batting(s,id){return s.batting[id]??=( {g:0,pa:0,ab:0,h:0,d:0,t:0,hr:0,rbi:0,bb:0,k:0,r:0,sf:0});}
function pitching(s,id){return s.pitching[id]??=({g:0,gs:0,w:0,l:0,sv:0,hld:0,bs:0,qs:0,outs:0,h:0,r:0,er:0,hr:0,bb:0,k:0,pitches:0});}
const inc=(o,k,n=1)=>{o[k]=(o[k]||0)+n;};
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
 for(const id of [awayId,homeId])if(!(id===s.teamId&&s.manualLineup))optimizeLineup(s,data,id);
 const lineups=[availableLineup(s,data,awayId),availableLineup(s,data,homeId)];
 const fieldingDefense=side=>{const map=s.teams[[awayId,homeId][side]].fielding||{};const vals=lineups[side].filter(id=>map[id]&&map[id]!=='DH').map(id=>(defenseAt(byId[id],map[id])??50)*(s.condition[id].energy<35?.85:1));return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:50;};
 const teamDefense=[fieldingDefense(0),fieldingDefense(1)];
 const teamIds=[awayId,homeId],score=[0,0],innings=[[],[]],index=[0,0],hits=[0,0],errors=[0,0];
 const arms=teamIds.map(id=>chooseStarter(s,data,id,id===s.teamId?options.starter:null));
 if(arms.some(p=>!p))throw new Error('無健康投手可出賽。');
 const usedArms=[new Set(),new Set()],boxB={},boxP={},moments=[];
 const startEnergy={};const pitchedPA={};
 const bstat=id=>boxB[id]??=({id,team_id:teamOf(s,byId[id]),ab:0,h:0,r:0,rbi:0,hr:0,bb:0,k:0});
 const pstat=id=>boxP[id]??=({id,team_id:teamOf(s,byId[id]),outs:0,h:0,r:0,er:0,bb:0,k:0,pitches:0});
 // Pitcher appearances per side, for wins, losses, saves, holds and blown saves.
 const apps=[[],[]],goAhead=[null,null];
 const enter=(side,pid,lead)=>apps[side].push({id:pid,entry:lead,exit:null});
 const changePitcher=side=>{
  const current=arms[side],last=apps[side].at(-1);if(last&&last.id===current&&last.exit==null)last.exit=score[side]-score[1-side];const own=rosterFor(s,data,teamIds[side]).filter(p=>hasPitch(p)&&!s.condition[p.id].injury&&!usedArms[side].has(p.id)&&p.id!==current);
  own.sort((a,b)=>{const val=p=>pitchValue(p)+(p.role==='SP'?-16:5)+s.condition[p.id].energy*.4;return val(b)-val(a);});
  if(own.length)arms[side]=own[0].id;
 };
 const note=(inning,half,msg,importance)=>moments.push({inning,half,text:msg,importance,score:[...score]});
 for(let inning=1;inning<=60;inning++){
  for(let side=0;side<2;side++){
   if(side===1&&inning>=9&&score[1]>score[0]){innings[1].push(null);break;}
   const defense=1-side;let outs=0,runs=0,bases=[null,null,null],paGuard=0,phantomOuts=0;
   if(inning>=10)bases[1]={id:lineups[side][(index[side]+8)%9],pitcher:arms[defense],unearned:true};
   // A run is unearned when the runner reached on an error, scored on an error, or after the inning should have ended.
   const scored=(runner,batterId,errorPlay=false)=>{score[side]++;runs++;batting(s,runner.id).r++;bstat(runner.id).r++;pitching(s,runner.pitcher).r++;pstat(runner.pitcher).r++;
    if(!runner.unearned&&!errorPlay&&outs+phantomOuts<3){inc(pitching(s,runner.pitcher),'er');pstat(runner.pitcher).er++;}
    if(batterId){batting(s,batterId).rbi++;bstat(batterId).rbi++;}
    if(score[side]===score[defense]+1)goAhead[side]={win:arms[side],lose:runner.pitcher};};
   while(outs<3){
    if(++paGuard>200)throw new Error('單局模擬超過上限，未儲存本次結果。');
    let pid=arms[defense],pc=pstat(pid),pitcher=byId[pid];
    if(!usedArms[defense].has(pid)){usedArms[defense].add(pid);startEnergy[pid]=s.condition[pid].energy;pitching(s,pid).g++;enter(defense,pid,score[defense]-score[side]);if(usedArms[defense].size===1)inc(pitching(s,pid),'gs');}
    const limit=usedArms[defense].size===1?85:27;
    if(pc.pitches>=limit||s.condition[pid].energy<20){changePitcher(defense);pid=arms[defense];pitcher=byId[pid];pc=pstat(pid);if(!usedArms[defense].has(pid)){usedArms[defense].add(pid);startEnergy[pid]=s.condition[pid].energy;pitching(s,pid).g++;enter(defense,pid,score[defense]-score[side]);}}
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
      if(distance===4){bs.hr++;gb.hr++;inc(pb,'hr');}else if(distance===2)inc(bs,'d');else if(distance===3)inc(bs,'t');
      const next=[null,null,null];
      for(let b=2;b>=0;b--)if(bases[b]){let target=b+distance;if(distance===1&&b===1&&random(s)<.55)target=3;if(distance===2&&b===0&&random(s)<.4)target=3;if(target>=3)scored(bases[b],bid);else next[target]=bases[b];}
      if(distance===4)scored(runner,bid);else next[distance-1]=runner;bases=next;
      if(distance===4)note(inning,side,`${batter.name} 轟出${score[side]-before[side]}分全壘打`,4+(inning>=7?3:0));
     }else{
      const avgDefense=teamDefense[defense];
      if(random(s)<clamp(.013-(avgDefense-50)*.0003,.004,.025)){
       errors[defense]++;runner.unearned=true;const next=[runner,null,null];for(let b=2;b>=0;b--)if(bases[b]){if(b===2)scored(bases[b],null,true);else next[b+1]=bases[b];}bases=next;phantomOuts++;
      }else if(bases[0]&&outs<2&&random(s)<.16){outs+=2;pb.outs+=2;pc.outs+=2;bases[0]=null;}
      else{if(bases[2]&&outs<2&&random(s)<.25){scored(bases[2],bid);bases[2]=null;bs.ab--;gb.ab--;inc(bs,'sf');}outs++;pb.outs++;pc.outs++;}
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
 const decisions=recordDecisions(s,apps,goAhead,score,winner===awayId?0:1,boxP);
 if(!options.postseason){s.teams[winner].w++;s.teams[loser].l++;for(let side=0;side<2;side++){s.teams[teamIds[side]].rs+=score[side];s.teams[teamIds[side]].ra+=score[1-side];}}
 const game={day:s.day,away:awayId,home:homeId,score,innings,hits,errors,winner,postseason:!!options.postseason,
  moments:moments.sort((a,b)=>b.importance-a.importance).slice(0,6).sort((a,b)=>a.inning-b.inning||a.half-b.half),batters:Object.values(boxB),pitchers:Object.values(boxP),lineups,decisions};
 return game;
}
// Official-style decisions, simplified: the pitcher of record at the final go-ahead run wins
// (a starter needs 5 innings, otherwise the longest winning reliever gets it); the pitcher charged
// with that run loses. Saves: the winning finisher who entered with a 1-3 run lead, or pitched 3+ innings.
// Holds and blown saves go to relievers who entered with a 1-3 run lead.
function recordDecisions(s,apps,goAhead,score,winSide,boxP){
 const loseSide=1-winSide,outsOf=id=>boxP[id]?.outs||0;
 for(let side=0;side<2;side++){const last=apps[side].at(-1);if(last&&last.exit==null)last.exit=score[side]-score[1-side];}
 const wApps=apps[winSide],starter=wApps[0];let win=goAhead[winSide]?.win;
 if(win===starter?.id&&outsOf(win)<15&&wApps.length>1)win=[...wApps.slice(1)].sort((a,b)=>outsOf(b.id)-outsOf(a.id))[0].id;
 const lose=goAhead[winSide]?.lose,closer=wApps.at(-1);
 let save=null;
 if(closer&&closer.id!==win&&wApps.length>1&&((closer.entry>=1&&closer.entry<=3&&outsOf(closer.id)>=1)||(closer.entry>=1&&outsOf(closer.id)>=9)))save=closer.id;
 if(win)inc(pitching(s,win),'w');if(lose)inc(pitching(s,lose),'l');if(save)inc(pitching(s,save),'sv');
 const holds=[],blown=[];
 for(let side=0;side<2;side++)apps[side].forEach((a,i)=>{
  if(i===0||a.entry<1||a.entry>3)return;
  if(a.exit<=0){blown.push(a.id);inc(pitching(s,a.id),'bs');}
  else if(a.id!==save&&a.id!==win&&outsOf(a.id)>=1&&a!==apps[side].at(-1)){holds.push(a.id);inc(pitching(s,a.id),'hld');}
 });
 for(let side=0;side<2;side++){const st=apps[side][0];if(st&&outsOf(st.id)>=18&&(boxP[st.id]?.er||0)<=3)inc(pitching(s,st.id),'qs');}
 return {win,lose,save,holds,blown};
}
export function standings(s){return Object.entries(s.teams).sort((a,b)=>(b[1].w/(b[1].w+b[1].l||1))-(a[1].w/(a[1].w+a[1].l||1))||((b[1].rs-b[1].ra)-(a[1].rs-a[1].ra))||a[0].localeCompare(b[0]));}
function recover(s,data){for(const p of data.players){const c=s.condition[p.id];c.energy=clamp(c.energy+(hasPitch(p)?18:c.lastPlayed===s.day-1?5:16),0,100);if(c.injury)c.injury--;if(c.formDays>0){c.formDays--;if(!c.formDays)c.form=0;}}}
export function findTradeProposal(s,data,fromTeam,opponent){
 if(s.phase!=='regular'||s.day>=tradeDeadline(s))return null;
 const mine=rosterFor(s,data,fromTeam).filter(p=>!s.condition[p.id].injury),theirs=rosterFor(s,data,opponent).filter(p=>!s.condition[p.id].injury);
 if(!mine.length||!theirs.length)return null;
 const blocked=new Set(untouchables(s,data,opponent));
 // The receiving club ranks our players by its own strategy; keep some randomness.
 const wanted=[...mine].map(p=>({p,v:strategyValue(s,data,opponent,p,null)*(.8+random(s)*.4)})).sort((a,b)=>b.v-a.v).map(x=>x.p);
 const targetStart=Math.floor(random(s)*theirs.length);
 for(let i=0;i<Math.min(8,wanted.length);i++){
  const give=wanted[i],receive=strategyValue(s,data,opponent,give,null);
  const options=theirs.filter(p=>!blocked.has(p.id)).sort((a,b)=>Math.abs(strategyValue(s,data,opponent,a,null)-receive)-Math.abs(strategyValue(s,data,opponent,b,null)-receive));
  for(let j=0;j<Math.min(4,options.length);j++){
   const get=options[(j+targetStart)%Math.min(4,options.length)];
   const cash=Math.max(0,Math.ceil((strategyValue(s,data,opponent,get,null)*1.05-strategyValue(s,data,opponent,give,get.id))*400000*(moneyScale(s)||1)/50000)*50000);
   const offer={fromTeam,targetTeam:opponent,giveId:give.id,getId:get.id,cash};
   if(evaluateTrade(s,data,offer).ok)return offer;
  }
 }
 return null;
}
export function makeEvent(s,data,forcedType=null){
 const own=rosterFor(s,data,s.teamId).filter(p=>!s.condition[p.id].injury);if(!own.length)return;
 const p=own[Math.floor(random(s)*own.length)],roll=random(s);
 const left=tradeDeadline(s)-s.day,frenzy=!forcedType&&s.phase==='regular'&&left>0&&left<=10&&random(s)<.45;
 const type=forcedType||(frenzy?(random(s)<.6?'trade_offer':'league_trade'):null)||(roll<.08?'injury':roll<.50?'story':roll<.56?'training':roll<.66?'clubhouse':roll<.72?'offfield':roll<.90?'trade_offer':roll<.97?'league_trade':'team');
 if(type==='story'){s.event=drawStory(s,data)||storyEvent(s,data,s.teamId,'clubhouse');return;}
 if(type==='trade_offer'||type==='league_trade'){
  const order={contender:0,balanced:1,rebuilding:2},others=data.teams.filter(t=>t.id!==s.teamId).sort((a,b)=>type==='league_trade'?order[teamStrategy(s,data,a.id)]-order[teamStrategy(s,data,b.id)]:0),start=type==='league_trade'?0:Math.floor(random(s)*others.length);
  for(let i=0;i<Math.min(5,others.length);i++){
   const from=type==='trade_offer'?s.teamId:others[(start+i)%others.length].id;
   const to=type==='trade_offer'?others[(start+i)%others.length].id:others[(start+i+1)%others.length].id;
   const offer=findTradeProposal(s,data,from,to);if(!offer)continue;
   const give=data.players.find(p=>p.id===offer.giveId),get=data.players.find(p=>p.id===offer.getId),a=data.teams.find(t=>t.id===from),b=data.teams.find(t=>t.id===to);
   const motive={contender:`${b.zh}（${STRATEGY_LABEL.contender}中）想補強即戰力，看上了 ${give.name}。`,rebuilding:`${b.zh}（${STRATEGY_LABEL.rebuilding}中）想累積年輕戰力，對 ${give.name} 很有興趣。`,balanced:`${b.zh} 想補強陣容弱點。`}[teamStrategy(s,data,b.id)];
   if(type==='trade_offer')s.event={type,player:p.id,title:`交易提案：${b.zh}`,text:`${motive}${b.zh} 提議用 ${get.name} 換取本隊 ${give.name}。${offer.cash?`本隊需附加 US$${offer.cash.toLocaleString('en-US')} 遊戲現金。`:'不附加現金。'}`,offer,choices:['接受交易','拒絕，保留目前陣容']};
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
  if(!s.aiOnly){
  for(const p of rosterFor(s,data,s.teamId)){if(!s.condition[p.id].formDays&&random(s)<.025){s.condition[p.id].form=random(s)<.5?-1:1;s.condition[p.id].formDays=3+Math.floor(random(s)*3);}}
  const due=dueStory(s,data);
  if(due){s.event=due;publishEvent(s,due);}
  else if(random(s)<EVENT_RATE){makeEvent(s,data);if(s.event)publishEvent(s,s.event);}
  }
  if(random(s)<.55){const clubs=data.teams.filter(t=>t.id!==s.teamId),id=clubs[Math.floor(random(s)*clubs.length)].id;const r=random(s);const e=storyEvent(s,data,id,r<.25?'injury':r<.85?'clubhouse':'offfield');if(e?.type==='clubhouse'){const available=e.options.map((o,i)=>i).filter(i=>eventChoiceStatus(s,data,e,i).ok),choice=available[Math.floor(random(s)*available.length)];applyClubhouseChoice(s,data,e,choice);e.text+=` 球團處理：${e.choices[choice]}。${e.options[choice].description}`;}publishEvent(s,e);}
 }
 if(s.phase==='regular'&&!s.aiOnly){const left=tradeDeadline(s)-s.day;
  if(left===7||left===1)addNews(s,{category:'trade',teamIds:[s.teamId],title:left===7?'交易截止倒數 7 天':'明天就是交易截止日',text:`爭冠球隊：${data.teams.filter(t=>teamStrategy(s,data,t.id)==='contender').map(t=>t.zh).join('、')}。重建球隊：${data.teams.filter(t=>teamStrategy(s,data,t.id)==='rebuilding').map(t=>t.zh).join('、')}。交易提案會更頻繁。`});
  if(left===0)addNews(s,{category:'trade',teamIds:[s.teamId],title:'交易截止，名單底定',text:'本季交易窗口關閉，各隊將以現有陣容拚戰到季末。'});}
 recordDailyNews(s,data,results);
 return results;
}

// Fictional contracts and finances. USD; one contract covers the current season.
// World mode: each league pays on its own scale (NPB about 30% of MLB, CPBL about 8%).
export const LEAGUE_PAY={MLB:1,NPB:.3,CPBL:.08};
// Club revenue and running costs follow the same league scale (only in world mode, where players carry a league).
export const moneyScale=s=>s?.world?(LEAGUE_PAY[s.league]??1):1;
export const LEAGUE_SCALE={MLB:{shift:0,spread:1},NPB:{shift:-8,spread:.92},CPBL:{shift:-15,spread:.85}};
const SKILL_KEYS=['contact','power','eye','stuff','control','movement'],ATHLETIC_KEYS=['speed','defense'];
export function worldRating(league,key,value){const k=LEAGUE_SCALE[league]||LEAGUE_SCALE.MLB;if(SKILL_KEYS.includes(key))return clamp(Math.round(49+(value-49)*k.spread+k.shift),20,80);if(ATHLETIC_KEYS.includes(key))return clamp(Math.round(value+k.shift/2),20,80);return value;}
export function marketSalary(p){const value=hasPitch(p)&&!hasBat(p)?pitchValue(p):Math.max(hasBat(p)?batValue(p):0,hasPitch(p)?pitchValue(p):0);return Math.round((250000+Math.pow(Math.max(0,value-40),2)*15000+(p.role==='SP'?350000:0))/50000)*50000;}
export function salaryOf(p){const pay=LEAGUE_PAY[p.league]??1;const base=marketSalary(p);return pay===1?base:Math.max(30000,Math.round(base*pay/10000)*10000);}
export function payroll(s,data,teamId){return rosterFor(s,data,teamId).reduce((sum,p)=>sum+salaryOf(p),0);}
export function salaryFractionRemaining(s){const plan=s.salaryPlan||{start:0,end:seasonGames(s),fraction:1};return Math.max(0,plan.fraction*(plan.end-s.day)/Math.max(1,plan.end-plan.start));}
export function dailySalary(s,data,teamId){const plan=s.salaryPlan;return Math.round(payroll(s,data,teamId)*(plan?plan.fraction/Math.max(1,plan.end-plan.start):1/seasonGames(s)));}
export function remainingSalary(s,data,teamId){return Math.ceil(payroll(s,data,teamId)*salaryFractionRemaining(s));}
// Save compatibility: versions 1..VERSION load; newer saves come from a newer app.
export function saveVersionSupported(v){return Number.isInteger(v)&&v>=1&&v<=VERSION;}
// A refreshed roster may add players (migrateSeason backfills their condition), but a save
// that still references removed players cannot be restored safely.
export function missingSavePlayers(s,data){
 const ids=new Set(data.players.map(p=>p.id)),refs=new Set();
 for(const club of Object.values(s.teams||{})){for(const id of club?.lineup||[])refs.add(id);for(const id of club?.rotation||[])refs.add(id);for(const id of Object.keys(club?.fielding||{}))refs.add(id);}
 for(const id of Object.keys(s.ownership||{}))refs.add(id);
 for(const id of Object.keys(s.batting||{}))refs.add(id);
 for(const id of Object.keys(s.pitching||{}))refs.add(id);
 return [...refs].filter(id=>!ids.has(id));
}
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
 s.storyQueue??=[];s.storyRecent??=[];s.storyFlags??={};
 // v1.6 stats: earned runs and decisions. Older rows treat every run as earned; decisions count from the upgrade day.
 for(const row of Object.values(s.pitching||{}))if(row.er==null){row.er=row.r;s.decisionStatsFrom??=s.day;}
 s.version=VERSION;s.ownership??={};s.tradeLog??=[];s.finance??={};
 for(const t of data.teams){
  const club=s.teams[t.id],roster=rosterFor(s,data,t.id);club.morale??=50;club.fielding??=assignFielding(club.lineup,data)||{};
  if(!s.finance[t.id]){const wages=payroll(s,data,t.id),remaining=remainingSalary(s,data,t.id);const opening=Math.ceil(remaining+20000000*moneyScale(s));s.finance[t.id]={cash:opening,openingCash:opening,budget:Math.ceil((wages*1.18+3000000*moneyScale(s))/100000)*100000,ticketPrice:35,income:0,salaryCost:0,operatingCost:0,tradeCash:0,ledger:[],sinceDay:s.day};}
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
  if(match){const standing=s.teams[t.id],win=standing.w/(standing.w+standing.l||1);attendance=match.home?homeAttendance(fanWinPct(standing),f.ticketPrice):0;const m=moneyScale(s);income=Math.round((150000+attendance*(f.ticketPrice+12))*m);cost=Math.round((match.home?180000:75000)*m);}
  f.cash+=income-wage-cost;f.income+=income;f.salaryCost+=wage;f.operatingCost+=cost;
  f.ledger.unshift({day:date,type:'operations',label:match?(match.home?'主場賽事':'客場賽事'):'休賽日',income,salary:wage,cost,attendance,net:income-wage-cost});f.ledger=f.ledger.slice(0,90);
 }
}
// Demand falls exponentially with price; elasticity and baseline grow with winning, capped by capacity.
// Revenue per fan is price + concessions, so the best price sits inside the range and depends on the record.
export const STADIUM_CAPACITY=45000,CONCESSION_PER_FAN=12;
export function homeAttendance(win,price){const w=clamp(Number.isFinite(win)?win:.5,0,1),base=24000+w*16000,elasticity=40+w*20;return Math.round(clamp(base*Math.exp(-(price-35)/elasticity),3000,STADIUM_CAPACITY));}
// Fans judge the club on a smoothed record (10-10 prior) so one early loss does not empty the stadium.
export function fanWinPct(t){return ((t?.w||0)+10)/((t?.w||0)+(t?.l||0)+20);}
export function gateEstimate(s,teamId,price){const fans=homeAttendance(fanWinPct(s.teams[teamId]),price);return {attendance:fans,gate:Math.round(fans*(price+CONCESSION_PER_FAN)*moneyScale(s))};}
export function setTicketPrice(s,teamId,price){if(!Number.isInteger(price)||price<15||price>80)throw new Error('票價需介於 US$15–80。');s.finance[teamId].ticketPrice=price;}
// ---- Front-office strategies: each AI club values players differently.
export const STRATEGY_LABEL={contender:'爭冠',rebuilding:'重建',balanced:'觀望'};
export const STRATEGY_HINT={contender:'想用潛力換即戰力，重視目前能力，較不在意薪資與年齡。',rebuilding:'想累積年輕球員、甩掉高薪老將，重視年齡與便宜合約。',balanced:'依價值交易，補強陣容弱點。'};
// Strategies and untouchables only change when the day, record or rosters change.
const tradeMemo=new WeakMap();
function memo(s,kind,teamId,compute){
 const key=`${s.year||2026}|${s.day}|${s.tradeLog?.length||0}|${Object.keys(s.ownership||{}).length}`;
 let m=tradeMemo.get(s);if(!m||m.key!==key){m={key,v:new Map()};tradeMemo.set(s,m);}
 const k=kind+'|'+teamId;if(!m.v.has(k))m.v.set(k,compute());return m.v.get(k);
}
export function teamStrategy(s,data,teamId){return memo(s,'strategy',teamId,()=>computeStrategy(s,data,teamId));}
function computeStrategy(s,data,teamId){
 const ids=Object.keys(s.teams),games=s.teams[teamId].w+s.teams[teamId].l;let order;
 if(games>=12)order=standings(s).map(([id])=>id);
 else{const strength=id=>{const r=rosterFor(s,data,id).map(p=>tradeValue(p,s)).sort((a,b)=>b-a).slice(0,14);return r.reduce((a,b)=>a+b,0);};order=[...ids].sort((a,b)=>strength(b)-strength(a)||a.localeCompare(b));}
 const rank=order.indexOf(teamId)/Math.max(1,ids.length-1);
 return rank<=.34?'contender':rank>=.66?'rebuilding':'balanced';
}
function bestPosition(p){return hasPitch(p)&&!hasBat(p)?(p.role==='SP'?'SP':'RP'):positionsOf(p).find(x=>x!=='DH')||'DH';}
function positionNeed(s,data,teamId,p,excludeId){
 // Bonus when the incoming player would start over the club's current option at his spot.
 const roster=rosterFor(s,data,teamId).filter(q=>q.id!==excludeId&&q.id!==p.id),pos=bestPosition(p);
 if(pos==='SP'||pos==='RP'){const arms=roster.filter(q=>hasPitch(q)&&(pos==='RP'||q.role==='SP')).map(pitchValue).sort((a,b)=>b-a),slot=arms[pos==='SP'?4:6]??0;return pitchValue(p)>slot+3?1.12:1;}
 const best=roster.filter(q=>hasBat(q)&&positionsOf(q).includes(pos)).map(batValue).sort((a,b)=>b-a)[0]??0;
 return batValue(p)>best+3?1.12:1;
}
export function strategyValue(s,data,teamId,p,excludeId){
 const base=tradeValue(p,s),age=playerAge(s,p),salary=salaryOf(p)/1000000,strategy=teamStrategy(s,data,teamId);
 let v=base;
 if(strategy==='contender')v=base*(age>=29?1.15:age<=24?.85:1)+salary*.25;
 else if(strategy==='rebuilding')v=base*(age<=25?1.3:age>=31?.6:1)-salary*.9;
 return Math.max(3,v*positionNeed(s,data,teamId,p,excludeId));
}
export function untouchables(s,data,teamId){return memo(s,'untouchable',teamId,()=>computeUntouchables(s,data,teamId));}
function computeUntouchables(s,data,teamId){
 const strategy=teamStrategy(s,data,teamId),roster=rosterFor(s,data,teamId);
 const pool=strategy==='rebuilding'?roster.filter(p=>playerAge(s,p)<=25):roster;
 const n=strategy==='balanced'?1:2;
 return pool.map(p=>({id:p.id,v:tradeValue(p,s)})).sort((a,b)=>b.v-a.v).slice(0,n).map(x=>x.id);
}
export function tradeValue(p,s){const raw=hasPitch(p)&&!hasBat(p)?pitchValue(p):Math.max(hasBat(p)?batValue(p):0,hasPitch(p)?pitchValue(p):0);const age=playerAge(s,p);return Math.max(5,(raw-35)*4*(age<=26?1.15:age>=35?.8:1)-salaryOf(p)/1000000*.3);}
// ---- Trades v3: up to 3 players each way, cash either way (positive: proposer pays; negative: the other club pays).
export const TRADE_MAX_PLAYERS=3,TRADE_CASH_LIMIT=20000000,CASH_PER_VALUE=400000;
export function normOffer(o){
 const list=(arr,one)=>[...new Set((arr&&arr.length?arr:one?[one]:[]).filter(Boolean))];
 const give=list(o.give,o.giveId),get=list(o.get,o.getId);
 return {fromTeam:o.fromTeam,targetTeam:o.targetTeam,give,get,cash:Number(o.cash||0),giveId:give[0],getId:get[0]};
}
// A package is worth its best piece plus diminishing credit for the rest (stars beat quantity).
const PACKAGE_WEIGHTS=[1,.55,.3];
export function packageValue(values){return [...values].sort((a,b)=>b-a).reduce((sum,v,i)=>sum+v*(PACKAGE_WEIGHTS[i]??.2),0);}
export function evaluateTrade(s,data,input){
 const offer=normOffer(input),{targetTeam,give:giveIds,get:getIds,cash}=offer,my=offer.fromTeam||s.teamId;
 const find=id=>data.players.find(p=>p.id===id),gives=giveIds.map(find),gets=getIds.map(find),reasons=[];
 if(s.phase!=='regular'||s.day>=tradeDeadline(s))reasons.push(`交易截止：僅例行賽前 ${tradeDeadline(s)} 日可交易。`);
 if(!s.teams[targetTeam]||targetTeam===my||!gives.length||!gets.length||gives.some(p=>!p||teamOf(s,p)!==my)||gets.some(p=>!p||teamOf(s,p)!==targetTeam))return {ok:false,reasons:['球員所屬已改變，請重新選擇。'],neededCash:0,offer};
 if(gives.length>TRADE_MAX_PLAYERS||gets.length>TRADE_MAX_PLAYERS)return {ok:false,reasons:[`每邊最多 ${TRADE_MAX_PLAYERS} 名球員。`],neededCash:0,offer};
 if(!Number.isSafeInteger(cash)||Math.abs(cash)>TRADE_CASH_LIMIT||cash%10000)return {ok:false,reasons:['交易現金需為 1 萬美元的倍數，且不超過 2,000 萬美元。'],neededCash:0,offer};
 if([...gives,...gets].some(p=>s.condition[p.id].injury))reasons.push('此版本不開放交易傷兵。');
 if(s.event?.type==='clubhouse'&&s.event.participants?.some(id=>giveIds.includes(id)||getIds.includes(id)))reasons.push('請先處理更衣室事件，再交易相關球員。');
 const sal=list=>list.reduce((a,p)=>a+salaryOf(p),0),delta=sal(gets)-sal(gives),myPayroll=payroll(s,data,my)+delta,otherPayroll=payroll(s,data,targetTeam)-delta;
 const myRemaining=Math.ceil(myPayroll*salaryFractionRemaining(s)),otherRemaining=Math.ceil(otherPayroll*salaryFractionRemaining(s));
 if(myPayroll>s.finance[my].budget)reasons.push('交易後本季薪資超過你的薪資預算。');
 if(otherPayroll>s.finance[targetTeam].budget)reasons.push('對方球隊無法容納交易後薪資。');
 if(cash>0&&s.finance[my].cash-cash<myRemaining)reasons.push('支付現金後不足以保留剩餘球季薪資。');
 if(cash<0&&s.finance[targetTeam].cash+cash<otherRemaining)reasons.push('對方現金不足，付不出這筆錢。');
 const locked=targetTeam!==s.teamId?untouchables(s,data,targetTeam):[];
 for(const p of gets)if(locked.includes(p.id))reasons.push(`${data.teams.find(t=>t.id===targetTeam).zh} 將 ${p.name} 列為非賣品。`);
 const receive=packageValue(gives.map(p=>strategyValue(s,data,targetTeam,p,getIds[0]))),lose=packageValue(gets.map(p=>strategyValue(s,data,targetTeam,p,null)));
 const perValue=CASH_PER_VALUE*(moneyScale(s)||1),offered=receive+cash/perValue,wanted=lose*1.05;
 // Positive: what we must add; negative: the most the other club would pay us on top.
 const step=perValue>=400000?50000:10000,balance=(wanted-receive)*perValue,neededCash=balance>0?Math.ceil(balance/step)*step:-Math.floor(-balance/step)*step;
 if(offered<wanted)reasons.push(neededCash>0?`對方認為價值不足，這組球員約需由本隊附加 US$${neededCash.toLocaleString('en-US')}。`:`對方最多只願意付 US$${(-neededCash).toLocaleString('en-US')}。`);
 for(const id of [my,targetTeam]){
  const out=id===my?giveIds:getIds,inn=id===my?gets:gives;
  const roster=rosterFor(s,data,id).filter(p=>!out.includes(p.id)).concat(inn),healthy=roster.filter(p=>!s.condition[p.id].injury);
  if(!assignFielding(healthy.filter(hasBat).map(p=>p.id),data)||healthy.filter(hasPitch).length<9)reasons.push(id===my?'本隊交易後無法組成完整陣容（九個守位、至少 9 名投手）。':'對方交易後無法組成完整陣容。');
 }
 return {ok:reasons.length===0,reasons,neededCash,delta,myPayroll,otherPayroll,remainingCash:s.finance[my].cash-cash,myRemaining,offered,wanted,offer};
}
// Counteroffers: alternatives the AI club would accept, built from the rejected draft.
export function tradeCounters(s,data,input){
 const offer=normOffer(input),my=offer.fromTeam||s.teamId,target=offer.targetTeam,current=evaluateTrade(s,data,offer);if(current.ok||!offer.give.length||!offer.get.length)return [];
 if(current.reasons.some(r=>/非賣品|所屬已改變|截止|傷兵/.test(r)))return [];
 const settle=o=>{const r=evaluateTrade(s,data,o);if(r.ok)return r.offer;if(r.neededCash&&Math.abs(r.neededCash)<=TRADE_CASH_LIMIT){const withCash={...r.offer,cash:Math.max(r.neededCash,-TRADE_CASH_LIMIT)};const again=evaluateTrade(s,data,withCash);if(again.ok)return again.offer;}return null;};
 const cashText=o=>o.cash>0?`，本隊附加 US$${o.cash.toLocaleString('en-US')}`:o.cash<0?`，對方付 US$${(-o.cash).toLocaleString('en-US')}`:'（不加現金）';
 const name=id=>data.players.find(p=>p.id===id).name,out=[];
 const same=settle({...offer,cash:Math.min(offer.cash,0)});if(same&&same.cash!==offer.cash)out.push({label:`照原組合${cashText(same)}`,offer:same});
 const pickBest=(list,build,label)=>{let best=null;for(const p of list){const o=settle(build(p));if(o&&(!best||o.cash<best.o.cash||o.cash===best.o.cash&&tradeValue(p,s)<tradeValue(best.p,s)))best={p,o};}if(best)out.push({label:label(best.p,best.o),offer:best.o});};
 const mine=rosterFor(s,data,my).filter(p=>!offer.give.includes(p.id)&&!s.condition[p.id].injury);
 if(offer.give.length<TRADE_MAX_PLAYERS)pickBest(mine,p=>({...offer,give:[...offer.give,p.id],cash:0}),(p,o)=>`對方要求再加上本隊的 ${p.name}${cashText(o)}`);
 if(offer.get.length>1)for(const id of offer.get){const o=settle({...offer,get:offer.get.filter(x=>x!==id),cash:0});if(o){out.push({label:`拿掉 ${name(id)}${cashText(o)}`,offer:o});break;}}
 const first=data.players.find(p=>p.id===offer.get[0]);
 const theirs=rosterFor(s,data,target).filter(p=>!offer.get.includes(p.id)&&!s.condition[p.id].injury&&hasBat(p)===hasBat(first)&&hasPitch(p)===hasPitch(first));
 pickBest(theirs,p=>({...offer,get:[p.id,...offer.get.slice(1)],cash:0}),(p,o)=>`把 ${first.name} 改成對方的 ${p.name}${cashText(o)}`);
 return out.slice(0,3);
}
export function executeTrade(s,data,input){
 const result=evaluateTrade(s,data,input);if(!result.ok)throw new Error(result.reasons.join('\n'));
 const offer=result.offer,{give,get,targetTeam,cash}=offer,my=offer.fromTeam||s.teamId;
 for(const id of give)s.ownership[id]=targetTeam;for(const id of get)s.ownership[id]=my;
 s.finance[my].cash-=cash;s.finance[my].tradeCash-=cash;s.finance[targetTeam].cash+=cash;s.finance[targetTeam].tradeCash+=cash;
 for(const id of [my,targetTeam]){
  const outgoing=id===my?give:get,incoming=(id===my?get:give).filter(pid=>hasBat(data.players.find(p=>p.id===pid)));
  let k=0;const ids=s.teams[id].lineup.map(pid=>outgoing.includes(pid)?incoming[k++]:pid).filter(Boolean);
  const assignment=ids.length===9&&new Set(ids).size===9?assignFielding(ids,data,s.teams[id].fielding):null;
  if(assignment){s.teams[id].lineup=ids;s.teams[id].fielding=assignment;}else{s.teams[id].lineup=autoLineup(rosterFor(s,data,id),s.condition);s.teams[id].fielding=assignFielding(s.teams[id].lineup,data);}
  s.teams[id].rotation=rosterFor(s,data,id).filter(hasPitch).sort((a,b)=>(b.role==='SP')-(a.role==='SP')||pitchValue(b)-pitchValue(a)).slice(0,5).map(p=>p.id);
 }
 s.tradeLog.unshift({day:s.day,fromTeam:my,targetTeam,give:[...give],get:[...get],giveId:give[0],getId:get[0],cash});
 const find=id=>data.players.find(p=>p.id===id);
 if(my===s.teamId||targetTeam===s.teamId){
  const own=my===s.teamId?my:targetTeam,outs=(own===my?give:get).map(find),inns=(own===my?get:give).map(find),club=s.teams[own];
  const reactions=[];
  for(const pOut of outs)if(playerTraits(s,pOut).includes('leader')){club.morale=clamp((club.morale??50)-6,0,100);reactions.push(`送走更衣室領袖 ${pOut.name}，球隊氣氛 −6`);}
  const promised=s.storyFlags?.promised_no_trade;
  if(promised!=null&&s.day-promised<=30){club.morale=clamp((club.morale??50)-10,0,100);delete s.storyFlags.promised_no_trade;reactions.push('違背「不交易」承諾，球員對球團失去信任，球隊氣氛 −10');}
  const ranks=rosterFor(s,data,own).map(p=>tradeValue(p,s)).sort((a,b)=>b-a);
  for(const pIn of inns)if(tradeValue(pIn,s)>=(ranks[2]??0)){club.morale=clamp((club.morale??50)+4,0,100);reactions.push(`明星新援 ${pIn.name} 加入，球隊氣氛 +4`);}
  if(reactions.length)addNews(s,{category:'decision',teamIds:[own],playerIds:[...give,...get],title:'更衣室對交易的反應',text:reactions.join('；')+'。'});
 }
 const names=ids=>ids.map(id=>find(id).name).join('、'),club=id=>data.teams.find(t=>t.id===id).zh;
 const money=cash>0?`，${club(my)} 另付 US$${cash.toLocaleString('en-US')} 遊戲現金`:cash<0?`，${club(targetTeam)} 另付 US$${(-cash).toLocaleString('en-US')} 遊戲現金`:'';
 addNews(s,{category:'trade',teamIds:[my,targetTeam],playerIds:[...give,...get],title:`交易成交：${club(my)} ↔ ${club(targetTeam)}`,text:`${club(my)} 送出 ${names(give)}，換入 ${club(targetTeam)} 的 ${names(get)}${money}。`});return result;
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
 e.options=options;describeOptions(e,data);e.choices=options.map(o=>o.label);return e;
}
function describeOptions(e,data){
 const name=id=>data.players.find(p=>p.id===id)?.name||'球員',signed=n=>(n>0?'+':'−')+Math.abs(n);
 for(const o of e.options){const parts=[];if(o.morale||!o.players?.length&&!o.teamEnergy&&!o.cost&&!o.income)parts.push(`球隊氣氛 ${signed(o.morale||0)}`);if(o.teamEnergy)parts.push(`全隊體力 ${signed(o.teamEnergy)}`);
  for(const x of o.players){if(x.injury)parts.push(`${name(x.id)} 休養 ${x.injury} 日`);if(x.energy)parts.push(`${name(x.id)} 體力 ${signed(x.energy)}`);if(x.form)parts.push(`${name(x.id)} ${x.form>0?'火熱':'低潮'} ${x.days} 日`);}
  if(o.cost)parts.push(`支出 US$${o.cost.toLocaleString('en-US')}`);if(o.income)parts.push(`收入 US$${o.income.toLocaleString('en-US')}`);
  if(o.follow)parts.push('之後可能有後續發展');if(o.note)parts.push(o.note);
  o.description=parts.join('；');}
 return e;
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
 // Story extras: injuries only when the roster stays legal, income, follow-up chains, flags.
 for(const x of o.players){if(!x.injury)continue;const c=s.condition[x.id],remaining=rosterFor(s,data,teamId).filter(p=>p.id!==x.id&&!s.condition[p.id].injury);
  if(assignFielding(remaining.filter(hasBat).map(p=>p.id),data)&&remaining.some(hasPitch))c.injury=Math.max(c.injury||0,x.injury);else c.energy=clamp(c.energy+10,0,100);}
 if(o.income){const f=s.finance[teamId];f.cash+=o.income;f.income+=o.income;f.ledger.unshift({day:s.day,type:'story',label:e.choices[index],income:o.income,salary:0,cost:0,attendance:0,net:o.income});f.ledger=f.ledger.slice(0,90);}
 if(o.follow&&teamId===s.teamId)s.storyQueue=[...(s.storyQueue||[]),{id:o.follow.id,day:s.day+o.follow.in,cast:e.cast||{}}];
 if(o.flag)s.storyFlags={...(s.storyFlags||{}),[o.flag]:s.day};
}

// ---- Story deck: context-weighted, rarity-tiered events with follow-up chains.
export function playerTraits(s,p){return traitsOf(p,p.birth_date?playerAge(s,p):null);}
function storyContext(s,data,teamId){
 const roster=rosterFor(s,data,teamId).filter(p=>!s.condition[p.id].injury);
 let streak=0;for(const g of s.history){if(g.away!==teamId&&g.home!==teamId)continue;const won=g.winner===teamId;if(!streak)streak=won?1:-1;else if(won===(streak>0))streak+=won?1:-1;else break;}
 const club=s.teams[teamId];
 return {roster,streak,rank:standings(s).findIndex(([id])=>id===teamId)+1,teams:data.teams.length,day:s.day,games:club.w+club.l,cash:s.finance[teamId]?.cash||0,morale:club.morale??50,flags:s.storyFlags||{},
  random:()=>random(s),pick:list=>list&&list.length?list[Math.floor(random(s)*list.length)]:null,name:id=>data.players.find(p=>p.id===id)?.name||'球員',
  traits:p=>playerTraits(s,p),age:p=>playerAge(s,p),form:p=>s.condition[p.id]?.form||0,energy:p=>s.condition[p.id]?.energy??100};
}
function buildStory(s,data,tpl,cast,teamId=s.teamId){
 const c=storyContext(s,data,teamId);cast=cast||(tpl.cast?tpl.cast(c):{});
 if(!cast||Object.values(cast).some(p=>!p))return null;
 const built=tpl.build(c,cast);if(!built?.options?.length)return null;
 const ids=[...new Set(Object.values(cast).map(p=>p.id))];
 const e={type:'clubhouse',story:tpl.id,rarity:tpl.rarity,teamId,player:ids[0]||null,participants:ids,cast:Object.fromEntries(Object.entries(cast).map(([k,p])=>[k,p.id])),title:built.title,text:built.text,options:built.options};
 describeOptions(e,data);e.choices=e.options.map(o=>o.label);return e;
}
function drawStory(s,data){
 const c=storyContext(s,data,s.teamId);if(!c.roster.length)return null;
 const recent=new Set(s.storyRecent||[]);
 const pool=STORIES.filter(t=>!t.followOnly&&!recent.has(t.id)).map(t=>({t,w:(t.weight?t.weight(c):1)*RARITY_WEIGHT[t.rarity]})).filter(x=>x.w>0);
 for(let tries=0;tries<4&&pool.length;tries++){
  const total=pool.reduce((a,x)=>a+x.w,0);let r=random(s)*total,i=0;for(;i<pool.length-1;i++){r-=pool[i].w;if(r<=0)break;}
  const e=buildStory(s,data,pool[i].t,null);if(e){s.storyRecent=[pool[i].t.id,...(s.storyRecent||[])].slice(0,12);return e;}pool.splice(i,1);
 }
 return null;
}
function dueStory(s,data){
 const queue=s.storyQueue||[],i=queue.findIndex(x=>x.day<=s.day);if(i<0)return null;
 const [item]=queue.splice(i,1),tpl=STORY_BY_ID[item.id];if(!tpl)return null;
 const roster=rosterFor(s,data,s.teamId),cast={};
 for(const [k,id] of Object.entries(item.cast||{})){const p=roster.find(p=>p.id===id);if(!p)return null;cast[k]=p;}
 const e=buildStory(s,data,tpl,cast);if(e)e.chain=true;return e;
}
// Deterministic entry point for content checks.
export function makeStory(s,data,id,cast){const tpl=STORY_BY_ID[id];return tpl?buildStory(s,data,tpl,cast||null):null;}

// Franchise continuity. The base snapshot stays immutable; evolving rosters
// are saved with the franchise and rehydrated before loading player IDs.
export const playerAge=(s,p)=>(s.year||2026)-Number(p.birth_date?.slice(0,4)||1998);
export function seasonData(base,s){return s?.playerPool?{...base,players:s.playerPool}:base;}
export const overall=p=>Math.max(hasBat(p)?batValue(p):0,hasPitch(p)?pitchValue(p):0);
function rookie(s,template,teamId,year,serial){
 const pick=xs=>xs[Math.floor(random(s)*xs.length)];const league=template.league;
 let name;
 if(league==='NPB')name=pick(['佐藤','鈴木','高橋','田中','伊藤','渡邊','山本','中村','小林','加藤','吉田','山田','佐佐木','山口','松本','井上','木村','清水'])+pick(['翔太','大輝','拓海','健太','蓮','悠真','陽斗','湊','颯太','優斗','大和','隼人','航','健斗','涼介','直樹']);
 else if(league==='MLB')name=pick(['Jake','Tyler','Mason','Ethan','Logan','Ryan','Caleb','Owen','Luis','Carlos','Diego','José','Brandon','Austin','Cole','Hunter'])+' '+pick(['Miller','Johnson','Davis','Garcia','Rodriguez','Martinez','Wilson','Anderson','Thomas','Moore','Hernandez','Lopez','Clark','Lewis','Walker','Young']);
 else name=pick(['林','陳','吳','張','黃','李','王','劉','楊','周','許','郭','蔡','鄭','謝','江'])+pick(['宇','柏','承','子','昱','宥','俊','奕','澤','冠','哲','以','景','恩','睿','曜'])+pick(['安','翔','恩','辰','廷','豪','宇','軒','凱','宏','霖','佑','睿','衡','翰','傑']);
 const age=18+Math.floor(random(s)*5),ratings={};
 // Rookie ratings are drawn on the league's own scale, then put on the world scale.
 for(const key of Object.keys(template.ratings)){const v=clamp(36+Math.floor(random(s)*17),20,80);ratings[key]=league?worldRating(league,key,v):v;}
 const id=`sim:${year}:${teamId}:${serial}`;
 return {id,name:`${name}（虛構新人）`,team_id:teamId,...(league?{league,origin:{NPB:'JPN',CPBL:'TWN'}[league]||'INTL'}:{}),position:hasBat(template)?primaryPosition(template):template.position,positions:[...positionsOf(template)],role:template.role,ratings,birth_date:`${year-age}-07-01`,bats:template.bats||'R',throws:template.throws||'R',jersey_number:String(10+Math.floor(random(s)*80)),status:'Active',simulated:true,rookieYear:year,developmentPotential:league?worldRating(league,'contact',56+Math.floor(random(s)*20)):56+Math.floor(random(s)*20)};
}
export function advanceSeason(previous,base){
 if(previous.phase!=='finished'||!previous.champion)throw new Error('請先完成本季冠軍賽，再進入下一季。');
 // Work on a clone: failures must leave the completed season intact.
 const old=structuredClone(previous),data=seasonData(base,old),year=(old.year||2026)+1;
 const changes=[],retirees=[],newcomers=[],players=[];let serial=0;
 const clubName=id=>base.teams.find(t=>t.id===id).zh;
 for(const original of data.players){
  const p=structuredClone(original),teamId=teamOf(old,p),age=year-Number(p.birth_date?.slice(0,4)||1998);p.team_id=teamId;
  // Lock generic IF/OF listings to the spot chosen from this season's ratings, so aging never reshuffles positions.
  if(hasBat(p)&&!DEF_SPOTS.includes(p.position)&&p.position!=='DH'){p.position=primaryPosition(original);p.positions=[...positionsOf(original)];}
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
 next.year=year;next.playerPool=players;next.createdAt=previous.createdAt;if(old.assistant)next.assistant={...old.assistant,hiredDay:0};
 const ranked=standings(old),rank=ranked.findIndex(([id])=>id===old.teamId)+1;
 const leaders=Object.entries(old.batting).filter(([id])=>data.players.some(p=>p.id===id)).sort((a,b)=>b[1].hr-a[1].hr).slice(0,5).map(([id,stats])=>({id,name:data.players.find(p=>p.id===id).name,hr:stats.hr,avg:stats.ab?Number((stats.h/stats.ab).toFixed(3)):0}));
 if(old.teamId)next.career=[...(old.career||[]),{year:old.year||2026,champion:old.champion,teamId:old.teamId,rank,record:{w:old.teams[old.teamId].w,l:old.teams[old.teamId].l},games:seasonGames(old),standings:ranked.map(([id,t])=>({id,w:t.w,l:t.l,rs:t.rs,ra:t.ra})),leaders,endingCash:old.finance[old.teamId].cash}];
 for(const t of base.teams){
  const f=next.finance[t.id],previousCash=old.finance[t.id].cash,wages=payroll(next,nextData,t.id),grant=Math.max(0,Math.ceil(wages+20000000*moneyScale(next)-previousCash));
  f.openingCash=previousCash;f.cash=previousCash+grant;f.income=grant;f.ticketPrice=old.finance[t.id].ticketPrice;f.ledger=[{day:0,type:'funding',label:`${year} 球季董事會補助`,income:grant,salary:0,cost:0,attendance:0,net:grant}];
 }
 next.offseason={from:old.year||2026,to:year,changes,retirees,newcomers};
 addNews(next,{category:'milestone',teamIds:[next.teamId],title:`${year} 新球季開幕`,text:`${clubName(old.champion)} 以衛冕冠軍身分迎接新球季。全聯盟 ${retirees.length} 人模擬退役、${newcomers.length} 位虛構新人加入。球員年齡與能力已更新；前季交易後的所屬延續。`});
 for(const t of base.teams){const retired=retirees.filter(p=>p.teamId===t.id),fresh=newcomers.filter(p=>p.teamId===t.id);if(retired.length||fresh.length)addNews(next,{category:'milestone',teamIds:[t.id],title:`${clubName(t.id)} 休賽季名單異動`,text:`${retired.length?'模擬退役：'+retired.map(p=>p.name+'（'+p.age+'歲）').join('、')+'。':''}新人報到：${fresh.map(p=>p.name+' · '+p.position).join('、')}。`});}
 return next;
}
