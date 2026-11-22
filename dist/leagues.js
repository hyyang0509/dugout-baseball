export const LEAGUES={MLB:{name:'美國職棒',teams:30},CPBL:{name:'中華職棒',teams:6},NPB:{name:'日本職棒',teams:12},KBO:{name:'韓國職棒',teams:10}};
export const saveKey=id=>id==='MLB'?'dugout.save.v1':`dugout.save.${id.toLowerCase()}.v1`;
// Older roster snapshots, kept so a world save that still uses one (no playerPool yet) keeps
// loading after the live roster file is refreshed. Keyed by the snapshot's generated_at.
export const LEGACY_ROSTERS={KBO:{'2026-11-19T09:31:04.904398+00:00':'roster_kbo_20251031.json'}};
export async function loadLegacyRoster(id,generatedAt){
 const file=LEGACY_ROSTERS[id]?.[generatedAt];
 if(!file)return null;
 const response=await fetch(`./data/${file}?v=33`);
 if(!response.ok)throw new Error('舊版球員名單讀取失敗');
 return response.json();
}
export async function loadLeague(id){
 if(!LEAGUES[id])throw new Error('未知聯盟');
 const response=await fetch(`./data/roster_${id.toLowerCase()}.json?v=33`);
 if(!response.ok)throw new Error('球員名單讀取失敗');
 const data=await response.json();
 if(data.teams?.length!==LEAGUES[id].teams||!data.players?.length)throw new Error('聯盟資料不完整');
 return data;
}
