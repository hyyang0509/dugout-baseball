# DUGOUT｜棒球經理

[立即試玩](https://hyyang0509.github.io/dugout-baseball/) · [程式碼](https://github.com/hyyang0509/dugout-baseball) · [測試與部署](https://github.com/hyyang0509/dugout-baseball/actions)

手機與電腦可玩的棒球球團經營遊戲。v2.2 支援美職 30 隊、日職 12 隊、韓職 10 隊、中職 6 隊在同一個世界進行，81 場生成賽程、四強季後賽、多年度經營、球員成長與退役、事件、交易、自由球員市場及遊戲財務。

美職、日職、韓職、中職在同一個世界存檔裡同時進行；跨聯盟交流賽尚未實作。中職中文姓名，日職漢字姓名，片假名姓名提供中文音譯；韓職姓名為遊戲依讀音轉寫的漢字。能力以 1–100 分顯示（四聯盟同一把尺）。

## 開發與部署

- Node.js 24，無外部前端相依套件。
- 執行 `npm test`：119 項測試。
- 本機啟動：`python -m http.server 8000 --directory dist`，開啟 `http://localhost:8000`。
- 網站目錄：`dist/`，不要直接發布儲存庫根目錄。
- GitHub Pages 的 Source 選 GitHub Actions；推送到 main 後先測試再發布 dist，PR 只測試。
- 本專案已經所有者同意設為公開，並以 GitHub Actions 發布至 GitHub Pages。

## 程式位置

| 路徑 | 用途 |
| --- | --- |
| dist/app.js | 畫面與互動 |
| dist/engine.js | 比賽、球季、交易、事件與年度演化 |
| dist/styles.css | 手機、桌面、亮暗色 |
| dist/data/roster_mlb.json | MLB 初始名單與估計評級 |
| dist/leagues.js | 聯盟資料載入與獨立存檔鍵 |
| dist/data/roster_cpbl.json、roster_npb.json、roster_kbo.json | 中職／日職／韓職官方名單與遊戲能力 |
| data_pipeline/ | Python 資料整理 |
| tests/ | 自動測試 |
| docs/CHANGELOG.md | 開發沿革及限制 |
| docs/HANDOFF.md | 開發交接 |
| PRD.md | 初始規格，部分功能尚未實作 |

## 存檔

目前進度存在各網站來源的瀏覽器 localStorage（dugout.save.v1），格式 v5，相容 v1–v4。新網址不會自動取得舊網址存檔，也尚未提供跨裝置雲端同步。原網站會保留；請勿清除原網站資料。存檔移轉將另行實作。

球員能力、合約、賽程、未來退役與事件均為遊戲設定，不是真實新聞或官方預測。遊戲不會捏造真實球員的犯罪劇情；場外事件只有門禁、遲到、失言等輕微情節。鄉民、球評、總教練與助理都是虛構角色。

## 中職與日職資料

2026/11/15 官方名單快照：中職 502 人（含一、二軍）、日職 829 人（支配下登錄）。來源為 https://stats.cpbl.com.tw/players 與 https://npb.jp/bis/teams/ 。

能力暫以穩定種子產生 40–60 的遊戲平衡值，尚未依成績校準，不能視為真實球員強弱排行。日職細分內外野守位及兩聯盟投手分工為遊戲估計。中職來源未提供生日，畫面顯示年齡未提供，換季暫採原引擎基準年齡。姓名原文與來源留在資料中，中文音譯非官方譯名。

三聯盟均沿用 81 場、前四名季後賽的遊戲賽制，非現實完整賽制。辦公室上方可切換聯盟；原 MLB 存檔鍵維持不變。

重建名單：安裝 data_pipeline/requirements.txt 後，執行 `python data_pipeline/fetch_asia_rosters.py`。名單更新前需另行驗證舊存檔相容性，不會自動線上更新。

## 韓職資料

名單是 2026 球季結束後（2026-11-20）的各隊名單（10 隊、700 人），取自韓文維基百科的「各隊名單」模板（CC BY-SA），以 `data_pipeline/update_kbo_wiki.py` 產生。KBO 官網的 robots.txt 禁止未經事先核准的自動收集、爬取與複製，所以不直接抓官網。

- **能力**：仍在名單上的球員沿用 2024–2025 韓職一軍成績換算的能力（KBO 官方紀錄，由開源專案 KBOFM2025 整理，`data_pipeline/build_kbo.py` 轉換）。維基百科沒有比賽成績，所以 2026 球季的成績還沒有反映在能力上。
- **新球員**：2026 年新加入的洋將、亞洲名額球員（例如韓華鷹的王彥程）、新人與回歸者都沒有成績可用，能力是遊戲估計值（`ratings_source` 以 `estimate_new_2026_` 開頭）。生日、投打與國籍取自他們的維基百科條目。
- **名單人數**：維基百科的名單包含培育球員，每隊最多保留 70 人，略去能力最低、沒有成績資料的新人。
- **FA**：季後申請 FA、還沒簽約的球員暫列原球隊。
- **跨聯盟**：和 roster_mlb.json、roster_npb.json 比對後，沒有發現 2026 季後從韓職轉往美職或日職的球員。反過來，Tristan Beck、Troy Watson（原美職）和福谷浩司（原日職）已轉到韓職，但美職、日職名單快照還沒有更新，所以目前會同時出現在兩個聯盟。
- **舊存檔**：2025 版名單保留為 `dist/data/roster_kbo_20251031.json`。用舊名單開始、還在第一季的世界存檔會繼續使用舊名單；新開的世界才用 2026 名單。
- **姓名**：韓國球員姓名是遊戲依讀音轉寫的漢字，不是官方漢字名（少數知名球員除外）；日本、台灣球員用本名漢字，其他洋將用中文音譯。
