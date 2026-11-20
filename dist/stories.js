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
   opt('教練團也一起剃頭',{morale:18,players:[pl(p.id,{form:1,days:6})]}),opt('拍照上傳社群，球迷瘋傳',{morale:12,income:80000})]})},
 // ================================================================ v2.7 expansion
 // Every template below involves real players only in sports, media, family or community
 // situations. `leagues` limits a template to those leagues; `scene` picks the illustration.
 // ---------------------------------------------------------------- training
 {id:'video_session',rarity:'common',scene:'training',cast:c=>({p:c.pick(hitters(c))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 想多看對手影片`,text:`${c.name(p.id)} 請情蒐組把下一輪對手投手近十場的配球剪成影片，想在賽前多看幾遍。`,options:[
   opt('情蒐組加班剪輯',{cost:15000,players:[pl(p.id,{form:1,days:4})]}),
   opt('只給一頁重點摘要',{players:[pl(p.id,{energy:-2})],morale:1}),
   opt('請他相信自己的感覺',{morale:1})]})},
 {id:'new_grip',rarity:'common',scene:'training',cast:c=>({q:c.pick(pitchers(c))}),
  build:(c,{q})=>({title:`${c.name(q.id)} 在練新球路握法`,text:`${c.name(q.id)} 在牛棚試了一種新的變化球握法，捕手說位移很漂亮，但控球還不穩定。`,options:[
   opt('允許比賽中試投',{players:[pl(q.id,{form:1,days:5,energy:-4})],note:'可能有一段磨合期'}),
   opt('先在牛棚練到穩定再說',{players:[pl(q.id,{energy:-6})],morale:1}),
   opt('維持原本的配球',{players:[pl(q.id,{energy:4})]})]})},
 {id:'stance_change',rarity:'common',scene:'training',weight:c=>hitters(c).some(p=>c.form(p)<0)?2:0.6,
  cast:c=>({p:c.pick(hitters(c).filter(p=>c.form(p)<=0))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 想改打擊站姿`,text:`${c.name(p.id)} 覺得最近揮棒慢了半拍，想把站姿調開一點、手放低。打擊教練認為季中大改風險不小。`,options:[
   opt('支持他調整',{players:[pl(p.id,{form:1,days:6,energy:-6})]}),
   opt('只做小幅修正',{players:[pl(p.id,{energy:-3})],morale:1}),
   opt('季後再談',{players:[pl(p.id,{form:-1,days:2})],morale:2})]})},
 {id:'early_bp',rarity:'common',scene:'training',weight:c=>c.streak<=-2?2:0.7,
  build:c=>({title:'教練團提議提早打擊練習',text:`球隊最近${c.streak<0?`輸了 ${-c.streak} 場，`:''}攻勢斷斷續續。打擊教練想讓全隊提早兩小時到球場練打。`,options:[
   opt('全隊提早到場',{teamEnergy:-7,morale:3}),
   opt('只開放自願參加',{teamEnergy:-2,morale:2}),
   opt('照原本的時間表',{teamEnergy:2})]})},
 {id:'defense_drill',rarity:'common',scene:'training',
  build:()=>({title:'守備教練想加練雙殺',text:'上週出現幾次雙殺沒轉成功的失誤，守備教練想在賽前加一段內野轉傳練習。',options:[
   opt('加練二十分鐘',{teamEnergy:-4,morale:2}),
   opt('只找二游練',{teamEnergy:-1}),
   opt('不加練，看影片檢討',{morale:1})]})},
 {id:'weight_room',rarity:'common',scene:'training',cast:c=>({p:c.pick(c.roster)}),
  build:(c,{p})=>({title:`${c.name(p.id)} 季中仍想維持重訓量`,text:`${c.name(p.id)} 每天比賽後還要進重訓室。體能教練擔心他累積疲勞，他本人則說少練就會掉力量。`,options:[
   opt('照他的方式',{players:[pl(p.id,{energy:-8,form:1,days:4})]}),
   opt('改成隔天一次',{players:[pl(p.id,{energy:4})],morale:1}),
   opt('季中只做維持課表',{players:[pl(p.id,{energy:8})]})]})},
 {id:'sleep_coach',rarity:'common',scene:'training',
  build:()=>({title:'運動科學團隊推薦睡眠顧問',text:'運動科學團隊發現球員客場的睡眠時數普遍不足，建議請一位睡眠顧問跟隊一個月。',options:[
   opt('聘請顧問一個月',{cost:40000,teamEnergy:6}),
   opt('只調整客場作息表',{teamEnergy:3}),
   opt('暫時不需要',{morale:0})]})},
 {id:'mental_coach',rarity:'common',scene:'training',cast:c=>({p:c.pick(withTrait(c,'rookie').concat(withTrait(c,'quiet')))||c.pick(c.roster)}),
  build:(c,{p})=>({title:`${c.name(p.id)} 想找心理教練談談`,text:`${c.name(p.id)} 私下問球團能不能安排心理教練，他說最近站上場就會想太多。`,options:[
   opt('安排每週固定諮詢',{cost:12000,players:[pl(p.id,{form:1,days:6})]}),
   opt('請隊上老將陪他聊聊',{morale:2,players:[pl(p.id,{energy:3})]}),
   opt('先觀察一陣子',{players:[pl(p.id,{form:-1,days:2})]})]})},
 {id:'tempo_work',rarity:'common',scene:'training',cast:c=>({q:c.pick(pitchers(c))}),
  build:(c,{q})=>({title:`${c.name(q.id)} 投球節奏太慢`,text:`轉播單位統計，${c.name(q.id)} 的投球間隔是全隊最長，守備員站久了也容易分心。`,options:[
   opt('要求他加快節奏',{players:[pl(q.id,{form:-1,days:2})],morale:2}),
   opt('讓捕手幫他帶節奏',{players:[pl(q.id,{energy:-2})],morale:1}),
   opt('不干涉，照他的步調',{players:[pl(q.id,{energy:2})]})]})},
 {id:'bunt_practice',rarity:'common',scene:'training',
  build:()=>({title:'總教練要求全隊練觸擊',text:'最近幾場一出局二壘有人都沒能推進，總教練想讓先發九人賽前都練觸擊。',options:[
   opt('全員練習',{teamEnergy:-3,morale:1}),
   opt('只讓前後段棒次練',{teamEnergy:-1}),
   opt('交給球員自己決定',{morale:2})]})},
 // ---------------------------------------------------------------- medical
 {id:'blister',rarity:'common',scene:'medical',cast:c=>({q:c.pick(pitchers(c))}),
  build:(c,{q})=>({title:`${c.name(q.id)} 手指起水泡`,text:`${c.name(q.id)} 投球的中指磨出水泡，防護員說再投下去可能破皮。`,options:[
   opt('休息兩天讓它癒合',{players:[pl(q.id,{injury:2,energy:15})]}),
   opt('貼護膚膠帶照常輪值',{players:[pl(q.id,{form:-1,days:3})]}),
   opt('跳過一次先發',{players:[pl(q.id,{energy:20})],morale:-1})]})},
 {id:'back_spasm',rarity:'common',scene:'medical',weight:c=>c.games>10?1:0.3,cast:c=>({p:c.pick(c.roster)}),
  build:(c,{p})=>({title:`${c.name(p.id)} 背部緊繃`,text:`${c.name(p.id)} 賽前熱身時突然覺得下背緊繃，彎腰綁鞋帶都有點吃力。`,options:[
   opt('保守休息 2 天',{players:[pl(p.id,{injury:2,energy:20})]}),
   opt('熱敷按摩後先上場',{players:[pl(p.id,{energy:-8})]}),
   opt('安排檢查再決定',{cost:5000,players:[pl(p.id,{injury:1,energy:12})]})]})},
 {id:'food_poisoning',rarity:'uncommon',scene:'medical',
  build:()=>({title:'客場餐廳讓好幾位球員鬧肚子',text:'昨晚客場聚餐後，好幾位球員半夜腸胃不適，今天賽前臉色都不太好。',options:[
   opt('賽前縮短練習，全隊補水',{teamEnergy:-4,morale:1}),
   opt('請隊醫逐一檢查',{cost:8000,teamEnergy:-2}),
   opt('之後改由球團安排餐廳',{cost:20000,morale:3})]})},
 {id:'flu_round',rarity:'common',scene:'medical',
  build:()=>({title:'更衣室開始有人感冒',text:'這幾天換季，有三四位球員喉嚨痛、流鼻水。防護組擔心會在更衣室傳開。',options:[
   opt('全面消毒，生病的人分開休息',{cost:6000,teamEnergy:-2}),
   opt('發口罩和維他命',{cost:2000,teamEnergy:-4}),
   opt('只要能上場就照常',{teamEnergy:-7,morale:-1})]})},
 {id:'dental',rarity:'common',scene:'medical',cast:c=>({p:c.pick(c.roster)}),
  build:(c,{p})=>({title:`${c.name(p.id)} 牙痛到睡不好`,text:`${c.name(p.id)} 說智齒發炎，昨晚幾乎沒睡。牙醫說最好這兩天就拔掉。`,options:[
   opt('今天就去拔，休息一天',{players:[pl(p.id,{injury:1,energy:10})]}),
   opt('先吃消炎藥，休兵日再處理',{players:[pl(p.id,{energy:-10})]})]})},
 {id:'eye_check',rarity:'common',scene:'medical',cast:c=>({p:c.pick(hitters(c))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 說夜間看球不清楚`,text:`${c.name(p.id)} 覺得最近夜間比賽看球的輪廓有點模糊，懷疑是視力變了。`,options:[
   opt('立刻安排驗光並配隱形眼鏡',{cost:3000,players:[pl(p.id,{form:1,days:5})]}),
   opt('等休兵日再檢查',{players:[pl(p.id,{form:-1,days:3})]})]})},
 {id:'ankle_roll',rarity:'common',scene:'medical',cast:c=>({p:c.pick(hitters(c))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 跑壘時扭到腳踝`,text:`${c.name(p.id)} 昨天回壘時踩到壘包邊緣，腳踝有點腫，但他堅持可以上場。`,options:[
   opt('休息 3 天',{players:[pl(p.id,{injury:3,energy:20})],morale:-1}),
   opt('貼紮後改當指定打擊',{players:[pl(p.id,{energy:-6})],note:'打線請自行調整'}),
   opt('尊重他，照常出賽',{players:[pl(p.id,{energy:-12,form:-1,days:3})],morale:2})]})},
 // ---------------------------------------------------------------- clubhouse
 {id:'music_war',rarity:'common',scene:'clubhouse',
  build:()=>({title:'更衣室音樂之爭',text:'年輕球員想放饒舌，老將想聽老歌，兩派每天搶喇叭，連防護員都看不下去。',options:[
   opt('排班表，一天一派',{morale:4}),
   opt('賽前一律安靜',{morale:-2,teamEnergy:3}),
   opt('讓勝場最多的投手決定',{morale:2})]})},
 {id:'birthday_cake',rarity:'common',scene:'clubhouse',cast:c=>({p:c.pick(c.roster)}),
  build:(c,{p})=>({title:`今天是 ${c.name(p.id)} 的生日`,text:`隊友們偷偷準備了蛋糕，打算賽後在更衣室幫 ${c.name(p.id)} 慶生。`,options:[
   opt('球團加碼請全隊吃宵夜',{cost:6000,morale:5}),
   opt('簡單切蛋糕就好',{morale:3}),
   opt('球場大螢幕幫他祝壽',{morale:3,income:10000,players:[pl(p.id,{form:1,days:2})]})]})},
 {id:'rookie_prank',rarity:'common',scene:'clubhouse',weight:c=>withTrait(c,'rookie').length?1.3:0,
  cast:c=>({p:c.pick(withTrait(c,'rookie'))}),
  build:(c,{p})=>({title:`學長們要 ${c.name(p.id)} 穿布偶裝搭車`,text:`依照隊上傳統，新人要穿著學長挑的布偶裝坐球隊巴士。${c.name(p.id)} 看起來有點尷尬。`,options:[
   opt('傳統就是傳統，但點到為止',{morale:5,players:[pl(p.id,{form:-1,days:1})]}),
   opt('改成請新人表演唱歌',{morale:3}),
   opt('取消這個傳統',{morale:-2,players:[pl(p.id,{energy:3})]})]})},
 {id:'card_game',rarity:'common',scene:'clubhouse',
  build:()=>({title:'牌局玩到凌晨',text:'客場飯店裡，幾位球員打牌打到凌晨兩點，隔天練習時明顯沒精神。',options:[
   opt('訂門禁時間',{morale:-3,teamEnergy:5}),
   opt('口頭提醒就好',{teamEnergy:-2,morale:1}),
   opt('不管，他們是大人了',{teamEnergy:-4,morale:2})]})},
 {id:'chef_menu',rarity:'common',scene:'clubhouse',
  build:()=>({title:'球員抱怨主場餐點',text:'主場更衣室的賽前餐點連續兩週菜色差不多，幾位球員開玩笑說已經背得出菜單。',options:[
   opt('請專屬廚師一個月',{cost:35000,morale:5,teamEnergy:3}),
   opt('每週加一天外送',{cost:8000,morale:3}),
   opt('請廚房換菜色',{morale:1})]})},
 {id:'locker_move',rarity:'common',scene:'clubhouse',cast:c=>({p:c.pick(withTrait(c,'veteran'))||c.pick(c.roster)}),
  build:(c,{p})=>({title:`${c.name(p.id)} 想換置物櫃`,text:`${c.name(p.id)} 說他的置物櫃在空調出風口正下方，想換到角落那格，但那格是隊長的。`,options:[
   opt('請隊長讓一下',{morale:-1,players:[pl(p.id,{form:1,days:3})]}),
   opt('調整空調出風口',{cost:3000,morale:2}),
   opt('維持現狀',{players:[pl(p.id,{form:-1,days:2})]})]})},
 {id:'beard_pact',rarity:'common',scene:'clubhouse',weight:c=>c.streak>=3?2.5:0,
  build:c=>({title:'連勝期間全隊不刮鬍子',text:`球隊連贏 ${c.streak} 場，有人提議連勝期間大家都不刮鬍子。`,options:[
   opt('教練團也一起留',{morale:6}),
   opt('拍成影片放社群',{morale:4,income:20000}),
   opt('提醒大家注意儀容',{morale:-1})]})},
 {id:'team_dinner',rarity:'common',scene:'clubhouse',
  build:()=>({title:'隊長提議全隊聚餐',text:'隊長想在休兵日辦一次全隊聚餐，連家人也一起邀請。',options:[
   opt('球團全額買單',{cost:25000,morale:7}),
   opt('球團出一半',{cost:12000,morale:4}),
   opt('讓球員自己安排',{morale:2})]})},
 {id:'superstition',rarity:'common',scene:'clubhouse',cast:c=>({p:c.pick(hitters(c).filter(p=>c.form(p)>0))||c.pick(hitters(c))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 的幸運襪子`,text:`${c.name(p.id)} 堅持連續穿同一雙襪子，說換掉就打不出去了。洗衣房很困擾。`,options:[
   opt('尊重他的儀式',{players:[pl(p.id,{form:1,days:3})],morale:2}),
   opt('偷偷洗好再放回去',{morale:3}),
   opt('請他換掉',{players:[pl(p.id,{form:-1,days:2})]})]})},
 {id:'walkup_song',rarity:'common',scene:'clubhouse',cast:c=>({p:c.pick(hitters(c))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 想換出場曲`,text:`${c.name(p.id)} 想把出場曲換成一首老派情歌，說聽了心情比較放鬆。球迷社群已經在猜是哪首。`,options:[
   opt('辦球迷票選出場曲',{income:15000,morale:2}),
   opt('照他想要的換',{players:[pl(p.id,{form:1,days:3})]}),
   opt('維持原本的歌',{morale:0})]})},
 {id:'captain_vote',rarity:'uncommon',scene:'clubhouse',cast:c=>({p:c.pick(withTrait(c,'leader'))||best(c.roster,overall)}),
  build:(c,{p})=>({title:'球員想投票選隊長',text:`幾位球員提議用投票選出本季隊長，呼聲最高的是 ${c.name(p.id)}。`,options:[
   opt('舉辦投票',{morale:6,players:[pl(p.id,{form:1,days:4})]}),
   opt('由總教練指定',{morale:1}),
   opt('不設隊長，大家輪流帶',{morale:3})]})},
 {id:'vet_advice',rarity:'common',scene:'clubhouse',weight:c=>withTrait(c,'veteran').length?1.2:0,
  cast:c=>({p:c.pick(withTrait(c,'veteran'))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 主動給年輕投手建議`,text:`${c.name(p.id)} 看完比賽影片後，主動找了幾位年輕球員聊對手的習慣。`,options:[
   opt('請他每週固定分享',{morale:5,players:[pl(p.id,{energy:-3})]}),
   opt('公開感謝他',{morale:3}),
   opt('讓教練團來做就好',{morale:-1})]})},
 {id:'phone_ban',rarity:'common',scene:'clubhouse',
  build:()=>({title:'賽前滑手機的問題',text:'教練團發現開賽前半小時，更衣室裡一半的人都在滑手機看網路評論。',options:[
   opt('賽前一小時收手機',{morale:-3,teamEnergy:2}),
   opt('只禁止看賽事評論',{morale:1}),
   opt('不管',{morale:2})]})},
 {id:'rookie_dinner_bill',rarity:'common',scene:'clubhouse',weight:c=>withTrait(c,'rookie').length?1:0,cast:c=>({p:c.pick(withTrait(c,'rookie'))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 被學長「坑」請客`,text:`依照慣例，新人要請學長吃一次飯。帳單送來，${c.name(p.id)} 的表情很精彩。`,options:[
   opt('球團幫忙付一半',{cost:4000,morale:4}),
   opt('讓老將出面分攤',{morale:5}),
   opt('就當作入隊儀式',{morale:2,players:[pl(p.id,{form:-1,days:1})]})]})},
 // ---------------------------------------------------------------- media
 {id:'podcast_invite',rarity:'common',scene:'media',cast:c=>({p:c.pick(withTrait(c,'showman'))||c.pick(c.roster)}),
  build:(c,{p})=>({title:`知名節目邀 ${c.name(p.id)} 上 Podcast`,text:`一個收聽率很高的棒球節目邀請 ${c.name(p.id)} 錄一集，聊他的成長故事。`,options:[
   opt('答應錄音',{income:30000,players:[pl(p.id,{energy:-4})],morale:1}),
   opt('等休兵日再錄',{income:15000}),
   opt('婉拒',{players:[pl(p.id,{energy:3})]})]})},
 {id:'viral_clip',rarity:'common',scene:'media',cast:c=>({p:c.pick(hitters(c))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 的美技在網路瘋傳`,text:`${c.name(p.id)} 昨天一個飛撲接殺的影片，一晚累積了上百萬次觀看。`,options:[
   opt('官方帳號加剪精華',{income:25000,morale:2}),
   opt('推出紀念 T 恤',{income:60000,players:[pl(p.id,{form:1,days:3})]}),
   opt('低調處理',{morale:1})]})},
 {id:'tough_question',rarity:'common',scene:'media',weight:c=>c.streak<=-2?2:0.5,
  build:c=>({title:'賽後記者會被問到敏感問題',text:`記者問總教練：「${c.streak<0?'連敗':'最近'}期間有考慮換掉先發投手嗎？」現場氣氛有點僵。`,options:[
   opt('坦白回答，承認需要調整',{morale:-2}),
   opt('力挺球員，不做任何承諾',{morale:4}),
   opt('笑著把問題帶過',{morale:1})]})},
 {id:'documentary_crew',rarity:'uncommon',scene:'media',
  build:()=>({title:'紀錄片團隊想跟拍一季',text:'一家串流平台想拍球隊整季的紀錄片，會跟進更衣室和重要會議。',options:[
   opt('全面開放拍攝',{income:250000,morale:-3}),
   opt('開放，但更衣室不能拍',{income:120000,morale:1}),
   opt('婉拒',{morale:2})]})},
 {id:'trash_talk',rarity:'common',scene:'media',
  build:()=>({title:'對手球員在節目上嗆聲',text:'下一輪對手的一位球員在節目上說，本隊投手群「沒什麼好怕的」。',options:[
   opt('把剪報貼在更衣室',{morale:5,teamEnergy:-2}),
   opt('不回應，用比賽說話',{morale:3}),
   opt('官方帳號幽默回嘴',{morale:2,income:10000})]})},
 {id:'milestone_near',rarity:'common',scene:'media',cast:c=>({p:c.pick(withTrait(c,'veteran'))||c.pick(c.roster)}),
  build:(c,{p})=>({title:`${c.name(p.id)} 接近生涯里程碑`,text:`媒體開始倒數 ${c.name(p.id)} 的生涯里程碑，每天都有記者問他還差多少。`,options:[
   opt('準備紀念商品和儀式',{cost:20000,income:80000,players:[pl(p.id,{form:-1,days:2})]}),
   opt('請媒體給他一點空間',{players:[pl(p.id,{form:1,days:3})]}),
   opt('順其自然',{morale:1})]})},
 {id:'column_critic',rarity:'common',scene:'media',weight:c=>c.rank>c.teams/2?1.5:0.4,
  build:()=>({title:'專欄作家批評球團經營',text:'一位資深專欄作家寫了長文，批評球團今年的補強「看不出方向」。',options:[
   opt('約他吃飯說明規劃',{cost:2000,morale:1}),
   opt('公開回應，說明理念',{morale:2}),
   opt('不予理會',{morale:0})]})},
 {id:'mascot_dance',rarity:'common',scene:'fans',
  build:()=>({title:'吉祥物的新舞步爆紅',text:'球隊吉祥物在七局上半跳的新舞步被拍成短影片，連其他球團都在模仿。',options:[
   opt('推出吉祥物周邊',{income:45000,morale:2}),
   opt('邀球員一起跳',{morale:4,teamEnergy:-1}),
   opt('就讓它自然紅',{morale:1})]})},
 // ---------------------------------------------------------------- fans
 {id:'kid_letter',rarity:'common',scene:'fans',cast:c=>({p:c.pick(c.roster)}),
  build:(c,{p})=>({title:`小球迷寫信給 ${c.name(p.id)}`,text:`一位小學生寄來手寫信，說他學 ${c.name(p.id)} 的動作練球，夢想有一天能跟他一起打球。`,options:[
   opt('邀請小球迷到場開球',{cost:2000,morale:4,players:[pl(p.id,{form:1,days:3})]}),
   opt('請球員親筆回信',{morale:3}),
   opt('寄一顆簽名球',{morale:2})]})},
 {id:'foul_ball_kid',rarity:'common',scene:'fans',
  build:()=>({title:'界外球被大人搶走',text:'昨天一顆界外球飛向小朋友，卻被旁邊的大人搶走，影片在網路上被罵翻。',options:[
   opt('隔天送小朋友簽名球和球衣',{cost:1000,morale:3,income:15000}),
   opt('發聲明呼籲禮讓小球迷',{morale:2}),
   opt('不介入',{morale:-1})]})},
 {id:'autograph_line',rarity:'common',scene:'fans',
  build:()=>({title:'簽名排隊人潮爆滿',text:'週末簽名會的排隊人潮從球場排到停車場，有些人已經等了三個小時。',options:[
   opt('延長一小時，全部簽完',{teamEnergy:-4,morale:3,income:30000}),
   opt('發號碼牌，下次優先',{morale:1}),
   opt('準時結束',{morale:-2})]})},
 {id:'fan_banner',rarity:'common',scene:'fans',cast:c=>({p:c.pick(c.roster)}),
  build:(c,{p})=>({title:`看台上的巨幅布條`,text:`外野看台掛了一條手繪布條，上面寫著「${c.name(p.id)}，我們等你回來的那一棒」。`,options:[
   opt('請他賽後到外野致謝',{morale:3,players:[pl(p.id,{form:1,days:3,energy:-2})]}),
   opt('官方帳號轉發',{morale:2,income:5000})]})},
 {id:'rainout_refund',rarity:'common',scene:'weather',
  build:()=>({title:'雨延賽，退票方式引發抱怨',text:'昨天比賽打到三局因雨取消，球迷抱怨退票只能換同區、不能退現金。',options:[
   opt('全額退款',{cost:60000,morale:2}),
   opt('換票再加送一張',{cost:25000,morale:1}),
   opt('依原規定處理',{morale:-2})]})},
 {id:'ticket_promo',rarity:'common',scene:'office',weight:c=>c.rank>c.teams/2?1.4:0.7,
  build:()=>({title:'行銷部想推平日優惠票',text:'平日比賽上座率偏低，行銷部建議推出「平日買一送一」。',options:[
   opt('推出優惠',{income:30000,morale:2}),
   opt('只開放學生優惠',{income:15000,morale:1}),
   opt('維持原價',{morale:0})]})},
 {id:'season_ticket_meeting',rarity:'common',scene:'fans',
  build:()=>({title:'季票會員座談會',text:'季票會員代表希望和球團面對面談，主題包括座位、停車和球場餐飲。',options:[
   opt('總經理親自出席',{morale:2,income:20000}),
   opt('派業務主管出席',{morale:1}),
   opt('改成線上問卷',{morale:-1})]})},
 {id:'away_crowd',rarity:'common',scene:'fans',
  build:()=>({title:'客場來了一大群本隊球迷',text:'昨天客場比賽，本隊球迷包了好幾台遊覽車，三壘側幾乎都是我們的顏色。',options:[
   opt('賽後全隊過去致意',{morale:5,teamEnergy:-1}),
   opt('官方帳號感謝並抽送簽名球',{morale:3,income:5000})]})},
 {id:'cheer_song',rarity:'common',scene:'fans',cast:c=>({p:c.pick(hitters(c))}),
  build:(c,{p})=>({title:`球迷幫 ${c.name(p.id)} 寫了新應援曲`,text:`應援團幫 ${c.name(p.id)} 寫了一首新的應援曲，第一次在看台上唱就很有氣勢。`,options:[
   opt('列入官方應援曲',{morale:3,players:[pl(p.id,{form:1,days:4})]}),
   opt('推出應援曲毛巾',{income:30000})]})},
 {id:'old_jersey_night',rarity:'common',scene:'fans',
  build:()=>({title:'復古球衣日的球衣款式',text:'行銷部提出兩款復古球衣：一款是球團早年的經典款，一款是球迷投票選出的新設計。',options:[
   opt('經典款',{income:50000,morale:2}),
   opt('球迷票選款',{income:40000,morale:4}),
   opt('兩款都做',{cost:20000,income:80000,morale:2})]})},
 {id:'stadium_food',rarity:'common',scene:'fans',
  build:()=>({title:'球場美食排行出爐',text:'美食網站公布全聯盟球場美食排名，本隊主場排在倒數第二。',options:[
   opt('引進人氣攤商',{cost:30000,income:70000,morale:1}),
   opt('改善現有菜色',{cost:8000,income:20000}),
   opt('暫不處理',{morale:-1})]})},
 // ---------------------------------------------------------------- travel
 {id:'redeye_flight',rarity:'common',scene:'travel',
  build:()=>({title:'連夜搭機趕往下一個客場',text:'比賽打到延長，球隊得搭凌晨的班機前往下一個城市，抵達時天都亮了。',options:[
   opt('取消隔天的打擊練習',{teamEnergy:6,morale:1}),
   opt('照常練習',{teamEnergy:-6}),
   opt('包機提早出發',{cost:50000,teamEnergy:8})]})},
 {id:'hotel_mixup',rarity:'common',scene:'travel',
  build:()=>({title:'飯店房間出包',text:'客場飯店訂錯了房型，好幾位球員要兩人擠一間，有人只能睡加床。',options:[
   opt('立刻換更好的飯店',{cost:18000,morale:3}),
   opt('老將優先分配單人房',{morale:-1,teamEnergy:-2}),
   opt('將就一晚',{teamEnergy:-4})]})},
 {id:'lost_luggage',rarity:'common',scene:'travel',cast:c=>({p:c.pick(c.roster)}),
  build:(c,{p})=>({title:`${c.name(p.id)} 的球具袋不見了`,text:`航空公司把 ${c.name(p.id)} 的球具袋送錯城市，他慣用的${isPitcher(p)?'手套':'球棒和手套'}都在裡面。`,options:[
   opt('向隊友借用',{players:[pl(p.id,{form:-1,days:2})],morale:1}),
   opt('請廠商連夜送新的',{cost:4000,players:[pl(p.id,{energy:-2})]})]})},
 {id:'long_bus',rarity:'common',scene:'travel',
  build:()=>({title:'巴士遇上大塞車',text:'前往客場的路上遇到車禍封路，原本三小時的車程拉長到六小時。',options:[
   opt('打電話延後賽前練習',{teamEnergy:3}),
   opt('在車上放電影、發點心',{cost:1000,morale:3}),
   opt('照原本行程',{teamEnergy:-5})]})},
 {id:'travel_rain',rarity:'common',scene:'weather',
  build:()=>({title:'雨天被迫室內熱身',text:'客場連下兩天雨，球場沒有室內打擊區，球員只能在走廊熱身。',options:[
   opt('租附近的室內練習場',{cost:9000,teamEnergy:2,morale:1}),
   opt('縮短熱身',{teamEnergy:3}),
   opt('就在走廊練',{morale:-1})]})},
 // ---------------------------------------------------------------- weather
 {id:'rain_delay_long',rarity:'common',scene:'weather',
  build:()=>({title:'雨延兩個小時',text:'比賽中途下起大雨，球員在休息室等了兩個多小時，先發投手的肩膀也冷掉了。',options:[
   opt('換牛棚上來，保護先發',{teamEnergy:-3,morale:1}),
   opt('讓先發重新熱身繼續投',{teamEnergy:-5}),
   opt('請工作人員發熱食給球迷',{cost:5000,morale:3,income:8000})]})},
 {id:'fog_game',rarity:'uncommon',scene:'weather',
  build:()=>({title:'濃霧籠罩球場',text:'晚上起了大霧，外野手幾乎看不到高飛球，裁判正在考慮暫停。',options:[
   opt('建議裁判暫停',{morale:1}),
   opt('提醒外野手站前一點',{teamEnergy:-2,morale:2})]})},
 {id:'cold_snap',rarity:'common',scene:'weather',weight:c=>c.day<15||c.day>70?2:0.3,
  build:()=>({title:'寒流來襲',text:'氣溫驟降到個位數，投手說球握起來像石頭，打者手也被震得發麻。',options:[
   opt('添購暖手袋和保暖衣',{cost:7000,teamEnergy:3}),
   opt('延長熱身',{teamEnergy:-2}),
   opt('照常比賽',{teamEnergy:-4})]})},
 {id:'humid_night',rarity:'common',scene:'weather',weight:c=>c.day>25&&c.day<65?1.4:0.3,
  build:()=>({title:'悶熱的夜晚',text:'濕度超過九成，球員一局下來球衣就濕透，投手抱怨球很滑。',options:[
   opt('多準備幾套球衣與冰毛巾',{cost:4000,teamEnergy:3}),
   opt('牛棚提早準備',{teamEnergy:-2}),
   opt('照常',{teamEnergy:-3})]})},
 {id:'lightning',rarity:'uncommon',scene:'weather',
  build:()=>({title:'雷擊警報，比賽暫停',text:'球場附近偵測到雷擊，比賽暫停，球迷被要求離開露天座位。',options:[
   opt('開放室內大廳讓球迷避雨',{cost:3000,morale:2,income:5000}),
   opt('依標準流程處理',{morale:0})]})},
 // ---------------------------------------------------------------- front office
 {id:'budget_review',rarity:'common',scene:'office',weight:c=>c.games>20?1:0.2,
  build:()=>({title:'財務部季中預算檢討',text:'財務部提醒，本季營運支出超出預算一成，建議在後勤上縮減一些開銷。',options:[
   opt('縮減客場住宿等級',{income:30000,morale:-3}),
   opt('砍行銷預算',{income:20000}),
   opt('維持現狀',{morale:1})]})},
 {id:'analytics_hire',rarity:'uncommon',scene:'office',
  build:()=>({title:'數據分析師求職',text:'一位在大型科技公司做過資料科學的年輕人寄來履歷，說願意用低薪加入數據組。',options:[
   opt('錄用',{cost:30000,morale:2,teamEnergy:2}),
   opt('先簽短期約試用',{cost:10000,morale:1}),
   opt('婉拒',{morale:0})]})},
 {id:'stadium_repair',rarity:'common',scene:'office',
  build:()=>({title:'球場設施需要維修',text:'工程部回報，內野看台有一排座椅鬆動，外野燈塔也有幾盞燈不亮。',options:[
   opt('全部立即修繕',{cost:45000,morale:2}),
   opt('先修座椅',{cost:15000}),
   opt('季後一起處理',{morale:-2})]})},
 {id:'merch_deal',rarity:'common',scene:'office',
  build:()=>({title:'服飾品牌想合作聯名',text:'一家街頭服飾品牌想推出球隊聯名系列，願意先付一筆授權金。',options:[
   opt('簽下聯名合約',{income:90000,morale:1}),
   opt('要求更高的分成',{income:60000}),
   opt('不合作',{morale:0})]})},
 {id:'broadcast_deal',rarity:'uncommon',scene:'office',
  build:()=>({title:'新的轉播合作提案',text:'一家串流平台開價想取得本隊主場比賽的網路轉播權，條件是開賽時間要配合。',options:[
   opt('接受，開賽時間配合',{income:200000,teamEnergy:-3}),
   opt('只賣部分場次',{income:90000}),
   opt('維持現有合約',{morale:1})]})},
 {id:'scouting_trip',rarity:'common',scene:'office',
  build:()=>({title:'球探部想出差看業餘賽事',text:'球探部想派兩人去看一個業餘錦標賽，說有幾位年輕選手值得近距離觀察。',options:[
   opt('批准出差',{cost:15000,morale:1}),
   opt('只派一人',{cost:7000}),
   opt('看影片就好',{morale:0})]})},
 {id:'callup_request',rarity:'common',scene:'office',
  build:()=>({title:'二軍教練推薦一位年輕人',text:'二軍總教練打電話來說，有位年輕內野手最近打得很好，問一軍有沒有機會。',options:[
   opt('請他來一軍跟練幾天',{morale:3,teamEnergy:-1}),
   opt('再觀察一個月',{morale:0}),
   opt('請二軍給他更多先發機會',{morale:1})]})},
 {id:'naming_rights',rarity:'uncommon',scene:'office',weight:c=>c.cash<2000000?1.5:0.6,
  build:()=>({title:'企業想買球場冠名權',text:'一家企業提出購買球場冠名權，但有些老球迷反對改名。',options:[
   opt('接受冠名',{income:350000,morale:-4}),
   opt('只冠名外野看台',{income:120000,morale:-1}),
   opt('拒絕，保留原名',{morale:3})]})},
 // ---------------------------------------------------------------- community
 {id:'school_visit',rarity:'common',scene:'community',cast:c=>({p:c.pick(c.roster)}),
  build:(c,{p})=>({title:`小學邀請 ${c.name(p.id)} 到校分享`,text:`附近一所小學想請 ${c.name(p.id)} 在休兵日到學校，和學生聊聊怎麼面對失敗。`,options:[
   opt('答應出席',{morale:3,players:[pl(p.id,{energy:-3,form:1,days:3})]}),
   opt('錄一段影片給學生',{morale:2}),
   opt('婉拒，讓他休息',{players:[pl(p.id,{energy:4})]})]})},
 {id:'blood_drive',rarity:'common',scene:'community',
  build:()=>({title:'球場捐血活動',text:'血庫告急，捐血中心問能不能在主場外圍辦一場捐血活動。',options:[
   opt('舉辦，捐血送門票',{cost:8000,morale:3,income:5000}),
   opt('提供場地',{morale:2})]})},
 {id:'beach_cleanup',rarity:'common',scene:'community',
  build:()=>({title:'淨灘活動邀約',text:'環保團體邀請球隊參加休兵日的淨灘活動，希望用球員的影響力帶動更多人參加。',options:[
   opt('全隊參加',{teamEnergy:-3,morale:4}),
   opt('派幾位自願的球員',{morale:2}),
   opt('捐款支持',{cost:10000,morale:1})]})},
 {id:'youth_clinic',rarity:'common',scene:'community',cast:c=>({p:c.pick(withTrait(c,'mentor').concat(withTrait(c,'loyal')))||c.pick(c.roster)}),
  build:(c,{p})=>({title:`${c.name(p.id)} 想辦少棒營`,text:`${c.name(p.id)} 想在球季中找一天辦免費少棒營，親自教小朋友傳接球。`,options:[
   opt('球團全力支援',{cost:15000,morale:4,players:[pl(p.id,{energy:-4,form:1,days:3})]}),
   opt('季後再辦',{morale:1}),
   opt('交給社區部門辦',{cost:5000,morale:2})]})},
 {id:'disaster_relief',rarity:'uncommon',scene:'community',
  build:()=>({title:'外地發生水災',text:'外地傳出水災，災區有不少本隊球迷。球員私下討論想做點什麼。',options:[
   opt('球團捐款並辦義賣',{cost:80000,morale:6,income:30000}),
   opt('戴黑色臂章出賽並募款',{morale:4,income:20000}),
   opt('由球員自行捐款',{morale:2})]})},
 {id:'firefighter_night',rarity:'common',scene:'community',
  build:()=>({title:'消防員之夜',text:'市政府希望安排一場「消防員之夜」，邀請消防員和家屬免費進場。',options:[
   opt('舉辦，並請消防員開球',{cost:10000,morale:3,income:20000}),
   opt('提供一區免費座位',{cost:4000,morale:2})]})},
 // ---------------------------------------------------------------- CPBL
 {id:'cpbl_typhoon',rarity:'common',scene:'weather',leagues:['CPBL'],weight:c=>c.day>25&&c.day<70?2.5:0.4,
  build:()=>({title:'颱風警報，比賽延賽',text:'颱風逼近，氣象局發布陸上警報，聯盟宣布今明兩天比賽延賽，之後要補成雙重賽。',options:[
   opt('全隊放假兩天',{teamEnergy:10,morale:2}),
   opt('在室內練習場維持手感',{teamEnergy:3,morale:1}),
   opt('提早規劃雙重賽的投手調度',{teamEnergy:5})]})},
 {id:'cpbl_cheer_team',rarity:'common',scene:'fans',leagues:['CPBL'],
  build:()=>({title:'啦啦隊新成員引發話題',text:'球團啦啦隊新加入的成員在網路上爆紅，週末門票銷售明顯上升。',options:[
   opt('加開主題日與見面會',{income:70000,morale:2}),
   opt('推出應援周邊',{income:45000}),
   opt('維持原本規劃',{morale:1})]})},
 {id:'cpbl_night_market',rarity:'common',scene:'community',leagues:['CPBL'],cast:c=>({p:c.pick(c.roster)}),
  build:(c,{p})=>({title:`夜市攤商推出「${c.name(p.id)} 套餐」`,text:`球場附近的夜市攤商推出以 ${c.name(p.id)} 為名的雞排套餐，賣到要排隊。`,options:[
   opt('合作推出官方聯名',{income:35000,players:[pl(p.id,{form:1,days:2})]}),
   opt('請球員到攤位簽名',{morale:3,income:15000,players:[pl(p.id,{energy:-3})]}),
   opt('不介入',{morale:1})]})},
 {id:'cpbl_national_team',rarity:'uncommon',scene:'office',leagues:['CPBL'],cast:c=>({p:best(c.roster,overall)}),
  build:(c,{p})=>({title:`${c.name(p.id)} 入選國家隊集訓名單`,text:`棒協公布國際賽集訓名單，${c.name(p.id)} 名列其中，季後要參加集訓。`,options:[
   opt('全力支持，球團發新聞稿',{morale:4,income:20000,players:[pl(p.id,{form:1,days:5})]}),
   opt('支持，但請國家隊控管用量',{morale:2}),
   opt('私下表達擔心受傷',{morale:-2})]})},
 {id:'cpbl_afternoon_heat',rarity:'common',scene:'weather',leagues:['CPBL'],weight:c=>c.day>15&&c.day<65?1.6:0.3,
  build:()=>({title:'週末午後場熱到發燙',text:'週日下午的比賽，場地溫度超過四十度，人工草皮熱得燙腳。',options:[
   opt('加開灑水並準備冰浴',{cost:5000,teamEnergy:4}),
   opt('輪休幾位主力',{teamEnergy:6,morale:-1}),
   opt('照常',{teamEnergy:-5})]})},
 // ---------------------------------------------------------------- KBO
 {id:'kbo_cheer_leader',rarity:'common',scene:'fans',leagues:['KBO'],cast:c=>({p:c.pick(hitters(c))}),
  build:(c,{p})=>({title:`應援團長幫 ${c.name(p.id)} 編新口號`,text:`應援團長在看台上帶全場喊 ${c.name(p.id)} 的新口號，聲浪大到客隊投手都轉頭看。`,options:[
   opt('請應援團長到更衣室打氣',{morale:4,players:[pl(p.id,{form:1,days:3})]}),
   opt('把口號做成應援棒',{income:40000})]})},
 {id:'kbo_chimaek',rarity:'common',scene:'fans',leagues:['KBO'],
  build:()=>({title:'炸雞啤酒之夜',text:'行銷部想辦「炸雞啤酒之夜」，外野席買票送炸雞，合作商家還願意贊助。',options:[
   opt('舉辦',{income:60000,morale:2}),
   opt('只在週末辦',{income:30000}),
   opt('不辦',{morale:0})]})},
 {id:'kbo_monsoon',rarity:'common',scene:'weather',leagues:['KBO'],weight:c=>c.day>30&&c.day<60?2.5:0.3,
  build:()=>({title:'梅雨季連續延賽',text:'梅雨鋒面停留不走，已經連續三天延賽，賽程後段會變得很擠。',options:[
   opt('趁機讓全隊充分休息',{teamEnergy:10,morale:1}),
   opt('安排室內練習維持手感',{teamEnergy:4,morale:1}),
   opt('調整輪值，預留雙重賽人力',{teamEnergy:6})]})},
 {id:'kbo_service',rarity:'uncommon',scene:'office',leagues:['KBO'],weight:c=>c.roster.some(p=>c.age(p)>=24&&c.age(p)<=27)?1:0,
  cast:c=>({p:c.pick(c.roster.filter(p=>c.age(p)>=24&&c.age(p)<=27))}),
  build:(c,{p})=>({title:`${c.name(p.id)} 詢問兵役時程`,text:`${c.name(p.id)} 想和球團討論服役的時間點，希望能在狀態最好的時候兼顧職業生涯。（遊戲情節，非真實消息）`,options:[
   opt('請專人協助規劃',{cost:5000,morale:2,players:[pl(p.id,{form:1,days:3})]}),
   opt('季後再詳談',{morale:0}),
   opt('交給球員自己處理',{players:[pl(p.id,{form:-1,days:2})]})]})},
 {id:'kbo_derby',rarity:'common',scene:'media',leagues:['KBO'],
  build:()=>({title:'宿敵對決，門票秒殺',text:'這週末對上宿敵，三場門票開賣十分鐘就賣光，媒體天天在比較兩隊戰力。',options:[
   opt('加辦主題活動',{income:50000,morale:3,teamEnergy:-2}),
   opt('低調準備',{morale:2})]})},
 // ---------------------------------------------------------------- NPB
 {id:'npb_summer_road',rarity:'common',scene:'travel',leagues:['NPB'],weight:c=>c.day>35&&c.day<60?2.5:0.2,
  build:()=>({title:'夏季長客場之旅',text:'主場被出借給夏季活動，球隊得連續在外打兩週客場，球員已經開始想家。',options:[
   opt('安排家屬到客場探班',{cost:30000,morale:6}),
   opt('客場加一天休兵日行程',{teamEnergy:5}),
   opt('照常',{teamEnergy:-4})]})},
 {id:'npb_farm_callup',rarity:'common',scene:'office',leagues:['NPB'],
  build:()=>({title:'二軍傳來好消息',text:'二軍的年輕投手在東西軍對抗表現亮眼，二軍教練希望讓他上一軍見習。',options:[
   opt('讓他上來跟隊一週',{morale:3,teamEnergy:-1}),
   opt('維持在二軍調整',{morale:0}),
   opt('派投手教練去看',{cost:3000,morale:1})]})},
 {id:'npb_ouendan',rarity:'common',scene:'fans',leagues:['NPB'],cast:c=>({p:c.pick(hitters(c))}),
  build:(c,{p})=>({title:`應援團為 ${c.name(p.id)} 換了新的應援歌`,text:`私設應援團幫 ${c.name(p.id)} 換了新的應援歌，喇叭和太鼓的節奏很有記憶點。`,options:[
   opt('球員去應援團席致謝',{morale:4,players:[pl(p.id,{form:1,days:3})]}),
   opt('推出應援歌毛巾',{income:35000})]})},
 {id:'npb_bento',rarity:'common',scene:'fans',leagues:['NPB'],cast:c=>({p:c.pick(c.roster)}),
  build:(c,{p})=>({title:`球場推出「${c.name(p.id)} 便當」`,text:`球場餐飲部想推出以 ${c.name(p.id)} 為名的限定便當，菜色由他本人挑選。`,options:[
   opt('推出限定便當',{income:40000,players:[pl(p.id,{energy:-2})]}),
   opt('改由球迷投票選菜色',{income:30000,morale:2}),
   opt('不做',{morale:0})]})},
 {id:'npb_interleague',rarity:'common',scene:'media',leagues:['NPB'],weight:c=>c.day>15&&c.day<35?2:0.2,
  build:()=>({title:'交流戰開打，作戰方式要調整',text:'交流戰期間有幾場不能用指定打擊，投手要上場打擊，教練團在討論打序。',options:[
   opt('加練投手打擊與觸擊',{teamEnergy:-3,morale:2}),
   opt('照常準備',{morale:0})]})},
 // ---------------------------------------------------------------- MLB
 {id:'mlb_intl_series',rarity:'uncommon',scene:'travel',leagues:['MLB'],
  build:()=>({title:'海外系列賽邀約',text:'大聯盟邀請球隊參加下季的海外系列賽，在另一個大陸打兩場正式比賽。',options:[
   opt('接受邀請',{income:180000,teamEnergy:-6,morale:3}),
   opt('婉拒，避免時差',{teamEnergy:2})]})},
 {id:'mlb_bobblehead',rarity:'common',scene:'fans',leagues:['MLB'],cast:c=>({p:c.pick(c.roster)}),
  build:(c,{p})=>({title:`${c.name(p.id)} 搖頭娃娃日`,text:`行銷部規劃 ${c.name(p.id)} 搖頭娃娃日，前一萬名入場球迷可以拿到。`,options:[
   opt('加量到兩萬個',{cost:40000,income:110000}),
   opt('照原計畫一萬個',{cost:20000,income:60000}),
   opt('改成簽名海報',{cost:5000,income:20000})]})},
 {id:'mlb_road_trip',rarity:'common',scene:'travel',leagues:['MLB'],
  build:()=>({title:'十連戰客場之旅',text:'接下來要跨三個時區打十場客場，中間只有一天休兵日。',options:[
   opt('隨隊多帶一位按摩師',{cost:15000,teamEnergy:5}),
   opt('輪流讓主力休一場',{teamEnergy:6,morale:-1}),
   opt('照常',{teamEnergy:-4})]})},
 {id:'mlb_altitude',rarity:'common',scene:'travel',leagues:['MLB'],
  build:()=>({title:'高海拔客場的投球問題',text:'下一站是高海拔球場，球飛得遠，變化球也比較不會轉。投手教練想調整配球。',options:[
   opt('以速球與伸卡球為主',{morale:1}),
   opt('多帶一位牛棚投手',{teamEnergy:3}),
   opt('照常準備',{morale:0})]})},
 // ---------------------------------------------------------------- legendary
 {id:'retired_number',rarity:'legendary',scene:'fans',
  build:()=>({title:'球團退休背號典禮',text:'球團決定為一位傳奇老將退休背號，典禮當天全場球迷起立鼓掌超過三分鐘。',options:[
   opt('全隊穿著該背號熱身',{morale:14,income:150000}),
   opt('邀請傳奇對全隊講話',{morale:16,teamEnergy:-2})]})},
 {id:'celebrity_pitch',rarity:'legendary',scene:'media',
  build:()=>({title:'超人氣歌手來開球',text:'一位超人氣歌手答應來開球，演唱會等級的球迷湧進球場，周邊商品全部賣光。',options:[
   opt('加開周邊與看台',{income:280000,morale:6}),
   opt('請歌手七局唱應援曲',{income:180000,morale:12})]})},
 {id:'hometown_hero',rarity:'legendary',scene:'community',cast:c=>({p:c.pick(withTrait(c,'loyal'))||best(c.roster,overall)}),
  build:(c,{p})=>({title:`${c.name(p.id)} 的家鄉來了三千人`,text:`${c.name(p.id)} 的家鄉包了遊覽車來看球，整個看台舉著他的名字，他在熱身時紅了眼眶。`,options:[
   opt('賽後請他到看台致謝',{morale:12,players:[pl(p.id,{form:1,days:7})]}),
   opt('辦一場家鄉之夜',{morale:10,income:120000})]})}
];

export const STORY_BY_ID=Object.fromEntries(STORIES.map(t=>[t.id,t]));
