export const LEAGUES={MLB:{name:'美國職棒',teams:30},CPBL:{name:'中華職棒',teams:6},NPB:{name:'日本職棒',teams:12}};
export const saveKey=id=>id==='MLB'?'dugout.save.v1':`dugout.save.${id.toLowerCase()}.v1`;
export async function loadLeague(id){
 if(!LEAGUES[id])throw new Error('未知聯盟');
 const response=await fetch(`./data/roster_${id.toLowerCase()}.json?v=18`);
 if(!response.ok)throw new Error('球員名單讀取失敗');
 const data=await response.json();
 if(data.teams?.length!==LEAGUES[id].teams||!data.players?.length)throw new Error('聯盟資料不完整');
 return data;
}
