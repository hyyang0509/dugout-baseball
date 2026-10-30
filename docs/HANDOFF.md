# DUGOUT 開發交接

目前來源為 Sites v0.6，提交 eea75977a7280239c45d18cc8512b7839a6539ca。GitHub 專案預計接替為後續主要來源。未複製 Sites 身分設定、權杖或裝置存檔。

原生 HTML/CSS/JavaScript modules，無建置相依套件；Python 僅供資料整理。先維持玩法與存檔相容，不必先整套重寫框架。

## 存檔與引擎

- KEY：dugout.save.v1；engine VERSION=5。
- year/career/playerPool/offseason 保存年度演化；讀取時先 seasonData(base,save)，再 migrateSeason。
- advanceSeason 克隆舊存檔後演化。重新開局必須使用獨立的 baseData 初始名單。
- 每場開賽前雙方自動重排九人打線，守位必須完整且不重複。
- 引擎使用種子 RNG，不改為 Math.random。
- 財務均為遊戲美元，現金與收支帳必須對帳。
- 換季/重新開局儲存失敗時回復原狀態。

## 下一步

1. 舊網址存檔移轉，保留原進度並驗證內容。
2. 帳號、雲端存檔、版本衝突保護與備份。玩家存檔不可提交 GitHub。
3. 多聯盟統一球員 ID、資料格式、賽制與能力尺度，再做跨聯盟交流。
4. CPBL 官方抓取尚未通過真實回應驗證，NPB/KBO 尚未實作，不可宣稱已有四聯盟。

初始名單為 2026/10/30 MLB 快照，非即時。新人均為虛構。RA9 不是 ERA。投打統計含季後賽，團隊勝負只計例行賽。
