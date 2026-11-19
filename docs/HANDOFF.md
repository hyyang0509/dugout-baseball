# DUGOUT 開發交接

目前來源為 Sites v0.6，提交 eea75977a7280239c45d18cc8512b7839a6539ca。GitHub 專案現為後續主要來源，試玩網站為 https://hyyang0509.github.io/dugout-baseball/ 。未複製 Sites 身分設定、權杖或裝置存檔。

原生 HTML/CSS/JavaScript modules，無建置相依套件；Python 僅供資料整理。先維持玩法與存檔相容，不必先整套重寫框架。

## 存檔與引擎

- KEY：dugout.save.v1；engine VERSION=5。
- year/career/playerPool/offseason 保存年度演化；讀取時先 seasonData(base,save)，再 migrateSeason。
- advanceSeason 克隆舊存檔後演化。重新開局必須使用獨立的 baseData 初始名單。
- 電腦球隊每場開賽前自動重排九人打線；玩家球隊預設自動，手動調整後（`state.manualLineup`）改用玩家打線，僅替補傷兵與疲勞球員。守位必須完整且不重複。
- 引擎使用種子 RNG，不改為 Math.random。
- 財務均為遊戲美元，現金與收支帳必須對帳。
- 換季/重新開局儲存失敗時回復原狀態。

## 下一步

1. 舊網址存檔移轉，保留原進度並驗證內容。
2. 帳號、雲端存檔、版本衝突保護與備份。玩家存檔不可提交 GitHub。
3. 多聯盟統一球員 ID、資料格式、賽制與能力尺度，再做跨聯盟交流。
4. CPBL/NPB 官方快照已加入並可獨立開季；KBO 與跨聯盟尚未實作。能力暫為遊戲平衡值，詳見 README。

初始名單為 2026/10/30 MLB 快照，非即時。新人均為虛構。v1.6 起投手統計含自責分（ERA）、勝敗、救援、中繼與救援失敗；舊存檔的既有失分視為自責分，勝敗等從升級當天（state.decisionStatsFrom）起計。投打統計含季後賽，團隊勝負只計例行賽。

## v0.7 三聯盟

- dist/leagues.js 定義三聯盟與分開存檔；MLB 保持 dugout.save.v1，另有 dugout.save.cpbl.v1 / dugout.save.npb.v1；dugout.league 記最後選擇。
- switchLeague 先成功取得資料再切換，先 hydrate 再 migrate；讀取失敗不覆寫原存檔。
- 30 隊賽程算法保留；6/12 隊用循環賽與 Euler 定向產生 81 場，主客各 40/41 場。
- fetch_asia_rosters.py 可重建官方名單，遇缺隊、重複 ID、不完整守位會失敗；npb_names_zh.json 保存中文音譯對照。
- 47 項測試包括兩新聯盟的完整球季、換季、存檔 hydrate、交易、姓名與賽程。

## v1.6 數據與守位

- engine.js：positionProfile/positionsOf 回傳主守位＋可兼守位＋DH；日職 IF/OF 依球員 ID 與守備＋速度決定主守位，換季時寫回 p.position 固定。defenseAt 依守位打折；assignFielding 湊不齊九個守位時才允許緊急守位（捕手除外），無偏好時以兩兩交換提高總守備。
- ovr/potential：畫面上的總評（含主守位守備）與潛力；交易與財務仍用 overall。
- simulateGame 記錄自責分、二三壘安打、被全壘打、先發、勝敗、救援、中繼、救援失敗、優質先發（recordDecisions）；game.decisions 記本場勝敗救援。
- dist/stats.js：batLine/pitchLine、OPS+/ERA+、可排序表格欄位與 statRows。
