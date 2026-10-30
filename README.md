# DUGOUT｜棒球經理

[立即試玩](https://hyyang0509.github.io/dugout-baseball/) · [程式碼](https://github.com/hyyang0509/dugout-baseball) · [測試與部署](https://github.com/hyyang0509/dugout-baseball/actions)

手機與電腦可玩的棒球球團經營遊戲。v0.6 支援 MLB 30 隊、81 場生成賽程、四強季後賽、多年度經營、球員成長與退役、事件、交易及遊戲財務。

未來規劃 MLB、NPB、KBO、CPBL 與跨聯盟交流，目前不是四聯盟版本。

## 開發與部署

- Node.js 24，無外部前端相依套件。
- 執行 `npm test`：41 項測試。
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
| data_pipeline/ | Python 資料整理 |
| tests/ | 自動測試 |
| docs/CHANGELOG.md | 開發沿革及限制 |
| docs/HANDOFF.md | 開發交接 |
| PRD.md | 初始規格，部分功能尚未實作 |

## 存檔

目前進度存在各網站來源的瀏覽器 localStorage（dugout.save.v1），格式 v5，相容 v1–v4。新網址不會自動取得舊網址存檔，也尚未提供跨裝置雲端同步。原網站會保留；請勿清除原網站資料。存檔移轉將另行實作。

球員能力、合約、賽程、未來退役與事件均為遊戲設定，不是真實新聞或官方預測。犯罪劇情僅使用明確標示的虛構人物。
