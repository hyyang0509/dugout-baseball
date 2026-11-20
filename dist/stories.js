// DUGOUT story deck: player personalities and context-aware clubhouse events.
// Pure data + pure functions (no imports). The engine supplies a context object `c`:
//   c.roster (healthy own players), c.pick(list), c.name(id), c.traits(p), c.age(p),
//   c.streak (+wins / -losses in a row), c.rank, c.teams, c.day, c.games, c.cash,
//   c.morale, c.form(p), c.energy(p), c.flags, c.random().
// Every event involving real players stays benign (sports, media, family, community).
// Real players are never placed in crimes or scandals.

export const TRAIT_LABELS={
 leader:'領袖',hothead:'火爆',clutch:'關鍵先生',fragile:'玻璃身體',mercenary:'重視合約',
 loyal:'忠誠',grinder:'拚命三郎',showman:'媒體寵兒',mentor:'導師',rookie:'新人',veteran:'老將',quiet:'內向'
};
export const TRAIT_HINTS={
 leader:'容易主導更衣室會議，連敗時特別重要。',hothead:'情緒起伏大，容易與裁判或隊友衝突。',
 clutch:'渴望在關鍵時刻上場。',fragile:'較容易出現小傷。',mercenary:'重視合約與待遇，經紀人常出現。',
 loyal:'重視球團與家鄉，社區活動中表現亮眼。',grinder:'即使疲累也想上場。',showman:'媒體邀約多，也帶來贊助。',
 mentor:'願意帶年輕球員。',rookie:'經驗少，壓力事件影響較大。',veteran:'需要較多休息，也能穩定軍心。',quiet:'不善表達，需要細心照顧。'
};
const PERSONALITY=['leader','hothead','clutch','fragile','mercenary','loyal','grinder','showman','quiet'];

function hashBytes(text){
 // FNV-1a mixed into 4 bytes; deterministic so traits need no save migration.
 let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
 const out=[];for(let i=0;i<4;i++){h^=h>>>13;h=Math.imul(h,1274126177);out.push((h>>>24)&255);}return out;
}
export function traitsOf(p,age){
 const b=hashBytes(String(p.id)),list=[PERSONALITY[b[0]%PERSONALITY.length]];
 if(b[1]%100<45){const second=PERSONALITY[b[2]%PERSONALITY.length];if(second!==list[0])list.push(second);}
 if(age!=null&&age<=23)list.push('rookie');
 if(age!=null&&age>=33){list.push('veteran');if(b[3]%100<55)list.push('mentor');}
 return list;
}

// ---- option helpers --------------------------------------------------------
// opt(label,{morale,teamEnergy,players,cost,income,follow,flag}); pl(id,{energy,form,days,injury})
const opt=(label,o={})=>({label,morale:o.morale||0,teamEnergy:o.teamEnergy||0,players:o.players||[],cost:o.cost||0,income:o.income||0,follow:o.follow||null,flag:o.flag||null,note:o.note||''});
const pl=(id,o={})=>({id,energy:o.energy||0,form:o.form||0,days:o.days||0,injury:o.injury||0});
const has=(c,p,t)=>p&&c.traits(p).includes(t);
const withTrait=(c,t)=>c.roster.filter(p=>has(c,p,t));
const hitters=c=>c.roster.filter(p=>p.ratings.contact!=null);
const pitchers=c=>c.roster.filter(p=>p.ratings.stuff!=null);
const isPitcher=p=>p.ratings.contact==null;
const best=(list,score)=>[...list].sort((a,b)=>score(b)-score(a))[0];
const overall=p=>p.ratings.contact!=null?(p.ratings.contact+p.ratings.power+p.ratings.eye)/3:(p.ratings.stuff+p.ratings.control+p.ratings.movement)/3;

// rarity: common 1, uncommon .35, legendary .07 (multiplied by the template's weight)
export const RARITY_WEIGHT={common:1,uncommon:.35,legendary:.07};
export const RARITY_LABEL={common:'日常',uncommon:'少見',legendary:'傳奇'};

export const STORIES=[
 // ---------------------------------------------------------------- performance & form
 {id:'slump_extra',rarity:'common',weight:c=>c.roster.some(p=>c.form(p)<0)?3:0,
  cast:c=>({p:c.pick(c.roster.filter(p=>c.form(p)<0))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 陷入低潮`,text:isPitcher(p)?`${c.name(p.id)} 最近控球不穩，賽後還留在牛棚反覆練投。教練團在等你決定怎麼處理。`:`${c.name(p.id)} 最近手感冰冷，賽後留在室內打擊籠不肯離開。教練團在等你決定怎麼處理。`,options:[
   opt('安排專屬加練，找回節奏',{players:[pl(p.id,{energy:-14,form:1,days:4})],follow:{id:'slump_followup',in:5}}),
   opt('放兩天假，讓他放空',{players:[pl(p.id,{energy:20})]}),
   opt('公開表態信任，照常排他上場',{morale:4,players:[pl(p.id,{energy:-4})]})]})},
 {id:'slump_followup',rarity:'common',followOnly:true,
  build:(c,{p})=>({title:`加練之後：${c.name(p.id)} 的回饋`,text:`${c.name(p.id)} 說加練讓他重新抓到${isPitcher(p)?'放球點':'擊球點'}，想繼續保持每天的特別課表。`,options:[
   opt('繼續課表，但縮短時間',{players:[pl(p.id,{energy:-6,form:1,days:5})]}),
   opt('回到正常訓練，避免過勞',{players:[pl(p.id,{energy:10})],morale:2})]})},
 {id:'hot_media',rarity:'common',weight:c=>c.roster.some(p=>c.form(p)>0)?2.5:0.6,
  cast:c=>({p:c.pick(c.roster.filter(p=>c.form(p)>0).concat(withTrait(c,'showman')))||c.pick(c.roster)}),
  build:(c,{p})=>({title:`媒體搶訪 ${c.name(p.id)}`,text:`${c.name(p.id)} 成為本週話題人物，電視台與網路節目都想邀他專訪。${has(c,p,'quiet')?'但他私下表示不太習慣面對鏡頭。':''}`,options:[
   opt('接受專訪，球團收取節目合作費',{income:has(c,p,'showman')?120000:60000,players:[pl(p.id,{energy:-8,form:has(c,p,'quiet')?-1:1,days:3})]}),
   opt('只接受簡短聯訪',{morale:2,players:[pl(p.id,{energy:-3})]}),
   opt('婉拒所有邀約，專心比賽',{players:[pl(p.id,{energy:5})],morale:has(c,p,'showman')?-3:1})]})},
 {id:'clutch_cleanup',rarity:'common',weight:c=>withTrait(c,'clutch').some(p=>p.ratings.contact!=null)?1.6:0,
  cast:c=>({p:c.pick(withTrait(c,'clutch').filter(p=>p.ratings.contact!=null))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 想打關鍵棒次`,text:`自認是關鍵先生的 ${c.name(p.id)} 希望被排到第四棒，說「最後一打席交給我」。`,options:[
   opt('給他機會，公開表態支持',{players:[pl(p.id,{form:1,days:5})],morale:2,note:'打序請在「名單與打線」自行調整'}),
   opt('依數據決定棒次，不做承諾',{players:[pl(p.id,{form:-1,days:2})],morale:3}),
   opt('私下溝通，請他先穩定表現',{players:[pl(p.id,{energy:-3})]})]})},

 // ---------------------------------------------------------------- streaks & standings
 {id:'losing_meeting',rarity:'common',weight:c=>c.streak<=-3?4:0,
  cast:c=>({p:c.pick(withTrait(c,'leader'))||best(c.roster,overall)}),
  build:(c,{p})=>({title:`連敗 ${-c.streak} 場，更衣室氣氛凝重`,text:`球隊已經連輸 ${-c.streak} 場。${c.name(p.id)}${has(c,p,'leader')?'（隊上的領袖）':''} 主動來找你，問今天要不要開會。`,options:[
   opt(`讓 ${c.name(p.id)} 主持球員會議`,{morale:has(c,p,'leader')?12:6,players:[pl(p.id,{form:1,days:3})]}),
   opt('總教練親自訓話，嚴格要求',{morale:4,teamEnergy:-6}),
   opt('取消賽前訓練，全隊放鬆',{morale:2,teamEnergy:12})]})},
 {id:'win_streak',rarity:'common',weight:c=>c.streak>=4?3:0,
  build:(c)=>({title:`${c.streak} 連勝，主場湧進人潮`,text:`球隊拉出 ${c.streak} 連勝，周邊商品賣到缺貨，球員也想好好慶祝。`,options:[
   opt('球團請客辦慶功宴',{morale:10,teamEnergy:-6,cost:50000}),
   opt('舉辦球迷感謝見面會',{income:150000,teamEnergy:-5,morale:4}),
   opt('低調處理，保持專注',{morale:2,teamEnergy:4})]})},
 {id:'owner_visit',rarity:'uncommon',weight:c=>c.games>=10?1.2:0,
  build:(c)=>{const good=c.rank<=Math.ceil(c.teams/3),bad=c.rank>Math.ceil(c.teams*2/3);return {title:'老闆突然到球場視察',text:`老闆坐進包廂看了整場比賽，賽後把你叫去。目前球隊排名第 ${c.rank}／${c.teams}。${good?'他看起來心情很好。':bad?'他的臉色不太好看。':'他沒有多說什麼。'}`,options:good?[
   opt('爭取季中補強預算',{income:300000,morale:3}),opt('請老闆到更衣室替球員打氣',{morale:10})]:bad?[
   opt('承諾一週內改善戰績',{morale:6,teamEnergy:-6,flag:'promised_owner'}),opt('如實報告傷兵與陣容問題',{morale:-2,income:100000}),opt('請老闆給球員更多時間',{morale:3})]:[
   opt('簡報下半季計畫',{morale:3}),opt('帶老闆參觀訓練設施，爭取改善經費',{income:120000})]};}},

 // ---------------------------------------------------------------- personalities
 {id:'hothead_umpire',rarity:'common',weight:c=>withTrait(c,'hothead').length?1.8:0,
  cast:c=>({p:c.pick(withTrait(c,'hothead'))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 不滿判決激烈抗議`,text:`${c.name(p.id)} 對一顆好球判決非常不滿，與主審爭執後被提醒。媒體在等球團的說法。`,options:[
   opt('公開力挺球員',{morale:6,players:[pl(p.id,{form:1,days:2})],cost:20000,note:'聯盟罰款由球團支付'}),
   opt('私下約談，要求控制情緒',{morale:2,players:[pl(p.id,{form:-1,days:2})]}),
   opt('內部罰款並公開道歉',{morale:-3,income:20000,players:[pl(p.id,{form:-1,days:3})]})]})},
 {id:'feud',rarity:'uncommon',weight:c=>withTrait(c,'hothead').length&&c.roster.length>3?1.4:0,
  cast:c=>{const p=c.pick(withTrait(c,'hothead'));return {p,q:c.pick(c.roster.filter(x=>x.id!==p.id))};},
  build:(c,{p,q})=>({title:`${c.name(p.id)} 與 ${c.name(q.id)} 冷戰`,text:`上次守備失誤後，${c.name(p.id)} 和 ${c.name(q.id)} 已經三天沒說話，連傳接球都刻意分開。`,options:[
   opt('安排兩人同組訓練，逼他們溝通',{players:[pl(p.id,{energy:-6}),pl(q.id,{energy:-6})],follow:{id:'feud_followup',in:4}}),
   opt('請隊長私下調解',{morale:3}),
   opt('不介入，讓時間沖淡',{morale:-5})]})},
 {id:'feud_followup',rarity:'common',followOnly:true,
  build:(c,{p,q})=>({title:`後續：${c.name(p.id)} 與 ${c.name(q.id)} 和好了？`,text:`同組訓練幾天後，兩人在練習結束時擊掌了。隊友說更衣室的氣氛好很多。`,options:[
   opt('請兩人一起接受隊內表揚',{morale:9,players:[pl(p.id,{form:1,days:3}),pl(q.id,{form:1,days:3})]}),
   opt('低調看待，不特別張揚',{morale:5})]})},
 {id:'grinder_hurt',rarity:'common',weight:c=>withTrait(c,'grinder').some(p=>c.energy(p)<70)?2:0.4,
  cast:c=>({p:c.pick(withTrait(c,'grinder'))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 想帶傷上陣`,text:`防護員回報 ${c.name(p.id)} 腿後肌有些緊繃，但他堅持說「我可以打」。`,options:[
   opt('尊重他的意願，照常出賽',{players:[pl(p.id,{form:1,days:3,energy:-8})],morale:5,follow:{id:'grinder_aftermath',in:3}}),
   opt('強制休息 3 天',{players:[pl(p.id,{injury:3,energy:25})],morale:-2}),
   opt('出賽但限制打席與投球數',{players:[pl(p.id,{energy:-3})]})]})},
 {id:'grinder_aftermath',rarity:'common',followOnly:true,
  build:(c,{p})=>({title:`${c.name(p.id)} 的腿傷復發`,text:`連續出賽後，${c.name(p.id)} 的腿後肌又緊了，這次防護員態度更堅定。`,options:[
   opt('聽防護員的，進傷兵名單 5 天',{players:[pl(p.id,{injury:5,energy:30})]}),
   opt('冰敷後再觀察一天',{players:[pl(p.id,{energy:-10,form:-1,days:3})]})]})},
 {id:'fragile_tweak',rarity:'common',weight:c=>withTrait(c,'fragile').length?1.4:0,
  cast:c=>({p:c.pick(withTrait(c,'fragile'))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 又覺得肩膀卡卡的`,text:`${c.name(p.id)} 的身體一向需要細心照顧，今天熱身時又說有點不對勁。`,options:[
   opt('保守處理，休息 2 天',{players:[pl(p.id,{injury:2,energy:20})]}),
   opt('聘請專屬體能師',{cost:45000,players:[pl(p.id,{energy:15})],morale:2}),
   opt('只是小狀況，照常上場',{players:[pl(p.id,{energy:-10})]})]})},
 {id:'agent_call',rarity:'common',weight:c=>withTrait(c,'mercenary').length?1.5:0,
  cast:c=>({p:c.pick(withTrait(c,'mercenary'))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 的經紀人來電`,text:`${c.name(p.id)} 的經紀人想談待遇調整，暗示其他球團很有興趣。`,options:[
   opt('發放表現獎金安撫',{cost:80000,players:[pl(p.id,{form:1,days:5})],morale:2}),
   opt('答應季末再談',{players:[pl(p.id,{form:-1,days:2})],follow:{id:'agent_return',in:10}}),
   opt('明確拒絕，合約就是合約',{players:[pl(p.id,{form:-1,days:5})],morale:3})]})},
 {id:'agent_return',rarity:'common',followOnly:true,
  build:(c,{p})=>({title:`經紀人再次來電：${c.name(p.id)}`,text:`十天過去了，經紀人說 ${c.name(p.id)} 很在意球團的誠意，這次希望有具體回應。`,options:[
   opt('給一筆簽字獎金表示誠意',{cost:120000,players:[pl(p.id,{form:1,days:6})],morale:3}),
   opt('再拖一次',{players:[pl(p.id,{form:-1,days:4})],morale:-3})]})},
 {id:'loyal_hometown',rarity:'common',weight:c=>withTrait(c,'loyal').length?1.3:0,
  cast:c=>({p:c.pick(withTrait(c,'loyal'))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 想回母校辦棒球營`,text:`${c.name(p.id)} 想在休兵日回母校，替小朋友上一堂棒球課。`,options:[
   opt('球團全力支持並安排交通',{cost:30000,morale:6,players:[pl(p.id,{energy:-6,form:1,days:4})]}),
   opt('支持，但請他當天來回',{players:[pl(p.id,{energy:-10,form:1,days:2})]}),
   opt('等球季結束再辦',{players:[pl(p.id,{form:-1,days:2})]})]})},
 {id:'quiet_homesick',rarity:'common',weight:c=>withTrait(c,'quiet').length?1.2:0,
  cast:c=>({p:c.pick(withTrait(c,'quiet'))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 看起來很想家`,text:`翻譯私下告訴你，${c.name(p.id)} 最近吃不太下，常一個人在飯店。`,options:[
   opt('出錢讓家人來探班一週',{cost:40000,players:[pl(p.id,{form:1,days:6,energy:10})],morale:3}),
   opt('安排隊友帶他出去吃飯',{players:[pl(p.id,{form:1,days:2})],morale:2}),
   opt('請心理諮商師固定陪伴',{cost:15000,players:[pl(p.id,{energy:8})]})]})},
 {id:'mentor_pair',rarity:'common',weight:c=>withTrait(c,'mentor').length&&withTrait(c,'rookie').length?2:0,
  cast:c=>({p:c.pick(withTrait(c,'mentor')),q:c.pick(withTrait(c,'rookie'))}),
  build:(c,{p,q})=>({title:`${c.name(p.id)} 想帶新人 ${c.name(q.id)}`,text:`老將 ${c.name(p.id)} 注意到 ${c.name(q.id)} 的潛力，提議每天提早到球場一起訓練。`,options:[
   opt('好主意，就這麼做',{players:[pl(p.id,{energy:-6}),pl(q.id,{energy:-6})],morale:3,follow:{id:'rookie_breakthrough',in:6}}),
   opt('讓教練團主導，避免老將太累',{players:[pl(q.id,{energy:-4})]})]})},
 {id:'rookie_breakthrough',rarity:'common',followOnly:true,
  build:(c,{p,q})=>({title:`新人 ${c.name(q.id)} 開竅了`,text:`跟著 ${c.name(p.id)} 練了一週，${c.name(q.id)} 的${isPitcher(q)?'球路與控球':'擊球品質'}明顯提升，教練團相當驚喜。`,options:[
   opt('給他更多先發機會',{players:[pl(q.id,{form:1,days:7})],morale:4,note:'打序請在「名單與打線」自行調整'}),
   opt('公開感謝兩人，鼓勵傳承',{morale:8,players:[pl(p.id,{form:1,days:3}),pl(q.id,{form:1,days:3})]})]})},
 {id:'rookie_nerves',rarity:'common',weight:c=>withTrait(c,'rookie').length?1.4:0,
  cast:c=>({p:c.pick(withTrait(c,'rookie'))}),
  build:(c,{p})=>({title:`新人 ${c.name(p.id)} 壓力很大`,text:`${c.name(p.id)} 第一次在滿場觀眾前打球，賽前手一直在抖。`,options:[
   opt('排他上場磨練，不怕失敗',{players:[pl(p.id,{form:-1,days:2})],follow:{id:'rookie_grows',in:7}}),
   opt('先從代打、中繼開始',{players:[pl(p.id,{energy:8})]}),
   opt('安排運動心理師',{cost:15000,players:[pl(p.id,{form:1,days:3})]})]})},
 {id:'rookie_grows',rarity:'common',followOnly:true,
  build:(c,{p})=>({title:`${c.name(p.id)} 已經不再緊張`,text:`一週的磨練後，${c.name(p.id)} 說：「現在聽到觀眾聲音反而興奮。」`,options:[
   opt('好好表揚他',{morale:5,players:[pl(p.id,{form:1,days:5})]})]})},
 {id:'veteran_rest',rarity:'common',weight:c=>withTrait(c,'veteran').some(p=>c.energy(p)<75)?2:0.3,
  cast:c=>({p:c.pick(withTrait(c,'veteran'))}),
  build:(c,{p})=>({title:`老將 ${c.name(p.id)} 要求輪休`,text:`${c.name(p.id)} 坦白說身體需要喘口氣，希望這週少打幾場。`,options:[
   opt('同意，讓他休兩天',{players:[pl(p.id,{energy:30})],morale:2}),
   opt('請他再撐一週',{players:[pl(p.id,{energy:-8})],morale:-2}),
   opt('改當板凳教練一天，帶年輕球員',{players:[pl(p.id,{energy:15})],morale:5})]})},
 {id:'leader_speech',rarity:'uncommon',weight:c=>withTrait(c,'leader').length&&c.games>=15?1.2:0,
  cast:c=>({p:c.pick(withTrait(c,'leader'))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 的賽前演說`,text:`${c.name(p.id)} 在賽前圍圈時說了一段話，連教練都跟著點頭。`,options:[
   opt('把影片放上球團社群',{income:60000,morale:8}),opt('留在更衣室就好',{morale:10})]})},

 // ---------------------------------------------------------------- team operations
 {id:'travel_delay',rarity:'common',weight:()=>1,
  build:()=>({title:'客場班機大延誤',text:'颱風外圍環流導致班機延誤四小時，球員們在機場坐立難安。',options:[
   opt('改包遊覽車連夜移動',{cost:35000,teamEnergy:-4}),opt('在機場貴賓室等待',{teamEnergy:-10,morale:-2}),opt('就近住一晚，隔天一早出發',{cost:60000,teamEnergy:2})]})},
 {id:'heat_wave',rarity:'common',weight:c=>c.day>20&&c.day<60?1.4:0.5,
  build:()=>({title:'熱浪來襲，球場熱到 38 度',text:'連續高溫讓球員消耗很大，防護員建議調整訓練。',options:[
   opt('訓練改到傍晚，縮短時間',{teamEnergy:8,morale:2}),opt('添購降溫設備與電解質',{cost:30000,teamEnergy:12}),opt('照原定訓練，鍛鍊意志',{teamEnergy:-10,morale:-3})]})},
 {id:'nutrition_plan',rarity:'common',weight:()=>0.9,
  build:()=>({title:'營養師提出新菜單',text:'營養師建議改成高蛋白、低油的客製餐點，但每月要多花一筆錢。',options:[
   opt('全面採用',{cost:50000,teamEnergy:10,morale:2}),opt('只提供給主力球員',{cost:20000,teamEnergy:5}),opt('維持原菜單',{morale:-1})]})},
 {id:'analytics_shift',rarity:'common',weight:()=>1,
  cast:c=>({p:c.pick(hitters(c)),q:c.pick(pitchers(c))}),
  build:(c,{p,q})=>({title:'數據團隊提出新戰術',text:`數據團隊分析對手打擊分布，建議 ${c.name(q.id)} 調整配球、${c.name(p.id)} 改變守備站位。`,options:[
   opt('全面採用新戰術',{players:[pl(p.id,{form:1,days:4}),pl(q.id,{form:1,days:4})],teamEnergy:-4}),
   opt('先在練習中測試',{players:[pl(q.id,{form:1,days:2})]}),
   opt('相信球員的直覺',{morale:4})]})},
 {id:'bullpen_tired',rarity:'common',weight:c=>pitchers(c).filter(p=>c.energy(p)<70).length>=3?2.5:0.3,
  build:(c)=>{const tired=pitchers(c).filter(p=>c.energy(p)<75).slice(0,4);return {title:'牛棚投手群累壞了',text:`投手教練回報 ${tired.map(p=>c.name(p.id)).join('、')||'多名投手'} 疲勞累積，建議想辦法讓牛棚休息。`,options:[
   opt('讓先發投手盡量吃局數',{players:tired.map(p=>pl(p.id,{energy:15}))}),
   opt('全隊投手停練一天',{players:pitchers(c).map(p=>pl(p.id,{energy:8}))}),
   opt('不調整，季後再說',{morale:-2})]};}},
 {id:'sponsor_ad',rarity:'common',weight:()=>1.1,
  cast:c=>({p:c.pick(withTrait(c,'showman'))||best(c.roster,overall)}),
  build:(c,{p})=>({title:'運動品牌想找球員拍廣告',text:`一家運動品牌想邀 ${c.name(p.id)} 拍攝廣告，拍攝要佔用一個下午。`,options:[
   opt('接下合作',{income:has(c,p,'showman')?180000:100000,players:[pl(p.id,{energy:-10})]}),
   opt('改用全隊合照代言，收入較少',{income:60000,teamEnergy:-3,morale:2}),opt('婉拒，球季中不分心',{morale:1})]})},
 {id:'fan_signing',rarity:'common',weight:()=>1,
  build:()=>({title:'球迷簽名會企劃',text:'行銷部想在週末辦大型簽名會，預估能帶來可觀的周邊收入。',options:[
   opt('全隊出席',{income:140000,teamEnergy:-8,morale:3}),opt('只請三位球員輪流出席',{income:60000,teamEnergy:-2}),opt('改成線上抽獎活動',{income:25000})]})},
 {id:'charity_hospital',rarity:'common',weight:()=>0.9,
  cast:c=>({p:c.pick(withTrait(c,'loyal'))||c.pick(c.roster)}),
  build:(c,{p})=>({title:'兒童醫院探視邀請',text:`兒童醫院邀請球員探訪病童，${c.name(p.id)} 第一個舉手說想去。`,options:[
   opt('由球團贊助並全隊參加',{cost:20000,morale:9,teamEnergy:-4}),opt(`請 ${c.name(p.id)} 代表出席`,{morale:4,players:[pl(p.id,{form:1,days:3,energy:-4})]}),opt('改捐球具',{cost:10000,morale:2})]})},
 {id:'theme_night',rarity:'common',weight:()=>0.9,
  build:()=>({title:'行銷部提案：主題之夜',text:'行銷部想辦一場復古球衣主題之夜，需要先投入設計與製作費用。',options:[
   opt('大手筆辦，限定球衣全面販售',{cost:90000,follow:{id:'theme_result',in:4},morale:3}),
   opt('小規模試辦',{cost:25000,income:40000}),opt('今年先不辦',{})]})},
 {id:'theme_result',rarity:'common',followOnly:true,
  build:(c)=>{const hit=c.random()<0.65;return {title:hit?'主題之夜大成功！':'主題之夜反應平平',text:hit?'限定球衣開賣就秒殺，社群上滿滿都是球迷的照片。':'天氣不好加上宣傳不足，到場人數不如預期。',options:hit?[opt('加碼追加生產',{income:260000,morale:4})]:[opt('檢討後明年再試',{income:40000,morale:-2})]};}},
 {id:'rival_talk',rarity:'common',weight:()=>0.9,
  cast:c=>({p:c.pick(withTrait(c,'hothead'))||c.pick(c.roster)}),
  build:(c,{p})=>({title:'對手在媒體上放話',text:`對手總教練受訪時說「他們撐不了多久」，記者跑來問 ${c.name(p.id)} 的看法。`,options:[
   opt(`讓 ${c.name(p.id)} 嗆回去`,{morale:6,players:[pl(p.id,{form:has(c,p,'hothead')?1:0,days:3})],teamEnergy:-3}),
   opt('冷處理：用比賽回應',{morale:4}),opt('把剪報貼在更衣室',{morale:8,teamEnergy:-5})]})},
 {id:'equipment_bats',rarity:'common',weight:()=>0.7,
  cast:c=>({p:c.pick(hitters(c))}),
  build:(c,{p})=>({title:'球棒廠商送來新款試用',text:`廠商送來新款球棒，${c.name(p.id)} 試打後愛不釋手，但部分隊友說手感不習慣。`,options:[
   opt(`讓 ${c.name(p.id)} 先用`,{players:[pl(p.id,{form:1,days:4})]}),opt('全隊統一換新',{cost:25000,morale:2}),opt('季中不換裝備',{})]})},
 {id:'wellness_day',rarity:'common',weight:c=>c.roster.filter(p=>c.energy(p)<70).length>=6?2:0.4,
  build:()=>({title:'防護團隊建議恢復日',text:'全隊平均體力下滑，防護團隊提議安排一天恢復課程。',options:[
   opt('按摩、冰浴、伸展全套',{cost:25000,teamEnergy:14}),opt('簡單休息',{teamEnergy:8}),opt('照常訓練',{morale:-2,teamEnergy:-2})]})},
 {id:'scout_tip',rarity:'uncommon',weight:()=>0.8,
  cast:c=>({q:c.pick(pitchers(c))}),
  build:(c,{q})=>({title:'球探帶回對手情報',text:`球探發現下個對手打者有明顯的弱點，建議 ${c.name(q.id)} 針對性調整配球。`,options:[
   opt('買下完整情報報告',{cost:30000,players:[pl(q.id,{form:1,days:5})],morale:2}),opt('只參考摘要',{players:[pl(q.id,{form:1,days:2})]})]})},
 {id:'trade_rumor',rarity:'uncommon',weight:c=>c.games>=10?1:0,
  cast:c=>({p:best(c.roster,overall)}),
  build:(c,{p})=>({title:`網路瘋傳 ${c.name(p.id)} 將被交易`,text:`一則未經證實的爆料說球團正在兜售 ${c.name(p.id)}，他本人看起來很在意。`,options:[
   opt('總經理公開否認並保證不交易',{morale:6,players:[pl(p.id,{form:1,days:3})],flag:'promised_no_trade'}),
   opt('不回應傳聞',{players:[pl(p.id,{form:-1,days:4})]}),opt('當面跟他說明球團規劃',{players:[pl(p.id,{energy:-2})],morale:2})]})},
 {id:'bus_karaoke',rarity:'common',weight:()=>0.7,
  build:()=>({title:'客場巴士上的卡拉 OK 大賽',text:'長途車程中有人提議辦卡拉 OK 比賽，輸的人請全隊喝飲料。',options:[
   opt('教練團也一起下場',{morale:8,teamEnergy:-4}),opt('讓大家自由參加',{morale:4}),opt('請大家安靜休息',{teamEnergy:8,morale:-2})]})},

 // ---------------------------------------------------------------- legendary
 {id:'owner_title_bonus',rarity:'legendary',weight:c=>c.rank<=2&&c.games>=30?3:0,
  build:()=>({title:'老闆宣布：奪冠就發高額獎金',text:'老闆在記者會上宣布，只要拿下總冠軍，全隊都有一筆豐厚獎金。',options:[
   opt('全隊士氣大振',{morale:15,teamEnergy:-4}),opt('提醒大家專注眼前每一場',{morale:8,teamEnergy:4})]})},
 {id:'legend_returns',rarity:'legendary',weight:()=>1,
  build:()=>({title:'球團名人堂傳奇回到球場',text:'一位退休多年的球團傳奇回到球場擔任一日顧問，年輕球員圍著他問個不停。',options:[
   opt('請他對全隊演講',{morale:14}),opt('請他指導年輕球員打擊',{morale:6,players:[]}),opt('辦一場傳奇簽名會',{income:250000,morale:6})]})},
 {id:'sold_out_outfield',rarity:'legendary',weight:c=>c.streak>=2?2:0.5,
  build:()=>({title:'球迷包下整個外野席',text:'球迷後援會自發包下整個外野，準備了巨幅加油布條與整場應援。',options:[
   opt('賽後全隊到外野致謝',{morale:15,teamEnergy:-3,income:120000}),opt('送後援會簽名球衣',{morale:8,cost:15000})]})},
 {id:'comeback_vow',rarity:'legendary',weight:c=>c.streak<=-5?4:0,
  cast:c=>({p:c.pick(withTrait(c,'leader'))||best(c.roster,overall)}),
  build:(c,{p})=>({title:`${c.name(p.id)} 剃光頭立誓`,text:`連敗到第 ${-c.streak} 場，${c.name(p.id)} 剃了光頭走進更衣室，說「不贏球就不剪頭髮」。隊友紛紛跟進。`,options:[
   opt('教練團也一起剃頭',{morale:18,players:[pl(p.id,{form:1,days:6})]}),opt('拍照上傳社群，球迷瘋傳',{morale:12,income:80000})]})}
];

export const STORY_BY_ID=Object.fromEntries(STORIES.map(t=>[t.id,t]));
