# DUGOUT｜棒球經理

[立即試玩](https://hyyang0509.github.io/dugout-baseball/) · [程式碼](https://github.com/hyyang0509/dugout-baseball) · [測試與部署](https://github.com/hyyang0509/dugout-baseball/actions)

手機與電腦可玩的棒球球團經營遊戲。v0.7 支援 MLB 30 隊、中華職棒 6 隊、日本職棒 12 隊、81 場生成賽程、四強季後賽、多年度經營、球員成長與退役、事件、交易及遊戲財務。

三聯盟各自開季、各自存檔；KBO 與跨聯盟交流尚未實作。中職中文姓名，日職漢字姓名，片假名姓名提供中文音譯。

## 開發與部署

- Node.js 24，無外部前端相依套件。
- 執行 `npm test`：47 項測試。
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
| dist/data/roster_cpbl.json、roster_npb.json | 中職／日職官方名單與暫定遊戲能力 |
| data_pipeline/ | Python 資料整理 |
| tests/ | 自動測試 |
| docs/CHANGELOG.md | 開發沿革及限制 |
| docs/HANDOFF.md | 開發交接 |
| PRD.md | 初始規格，部分功能尚未實作 |

## 存檔

目前進度存在各網站來源的瀏覽器 localStorage（dugout.save.v1），格式 v5，相容 v1–v4。新網址不會自動取得舊網址存檔，也尚未提供跨裝置雲端同步。原網站會保留；請勿清除原網站資料。存檔移轉將另行實作。

球員能力、合約、賽程、未來退役與事件均為遊戲設定，不是真實新聞或官方預測。犯罪劇情僅使用明確標示的虛構人物。

## 中職與日職資料

2026/11/15 官方名單快照：中職 502 人（含一、二軍）、日職 829 人（支配下登錄）。來源為 https://stats.cpbl.com.tw/players 與 https://npb.jp/bis/teams/ 。

能力暫以穩定種子產生 40–60 的遊戲平衡值，尚未依成績校準，不能視為真實球員強弱排行。日職細分內外野守位及兩聯盟投手分工為遊戲估計。中職來源未提供生日，畫面顯示年齡未提供，換季暫採原引擎基準年齡。姓名原文與來源留在資料中，中文音譯非官方譯名。

三聯盟均沿用 81 場、前四名季後賽的遊戲賽制，非現實完整賽制。辦公室上方可切換聯盟；原 MLB 存檔鍵維持不變。

重建名單：安裝 data_pipeline/requirements.txt 後，執行 `python data_pipeline/fetch_asia_rosters.py`。名單更新前需另行驗證舊存檔相容性，不會自動線上更新。
