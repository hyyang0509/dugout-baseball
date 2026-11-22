# BM27（The Baseball Manager 2027，原名 DUGOUT）開發交接

- 遊戲顯示名稱為 BM27／The Baseball Manager 2027；網址、儲存庫名稱與存檔鍵仍為 dugout，不可改名，否則舊存檔讀不到。
- 新世界由 `engine.js` 的 `START_YEAR`（2027）開季；沒有 year 的舊存檔在 migrateSeason 視為 2026，已存在的世界存檔維持原本年份。

目前來源為 Sites v0.6，提交 eea75977a7280239c45d18cc8512b7839a6539ca。GitHub 專案現為後續主要來源，試玩網站為 https://hyyang0509.github.io/dugout-baseball/ 。未複製 Sites 身分設定、權杖或裝置存檔。

原生 HTML/CSS/JavaScript modules，無建置相依套件；Python 僅供資料整理。先維持玩法與存檔相容，不必先整套重寫框架。

## 存檔與引擎

- KEY：dugout.save.v1；engine VERSION=5。
- year/career/playerPool/offseason 保存年度演化；讀取時先 seasonData(base,save)，再 migrateSeason。
- advanceSeason 克隆舊存檔後演化。重新開局必須使用獨立的 baseData 初始名單。
- 世界存檔用 world.packWorld 寫入：playerPool 中與原始快照相同的靜態欄位（STATIC_KEYS：來源網址、原文姓名、資料來源、投打、背號等）不寫入，restoreWorld 一開始以 unpackPools 依球員 id 從目前 bases 補回。新增會在比賽中改變的欄位時，不可放進 STATIC_KEYS。非使用者聯盟 trimAI 時清掉 s.offseason（年度變化清單只給使用者聯盟看）。
- 先發投手：chooseStarter 先在輪值中找體力 ≥ 70、最久沒先發（condition.lastStart）的人；都不行才退回依體力與能力挑選。
- 球員姓名連結：app.js 的 MutationObserver 在 #app 與 #modal-root 變動後呼叫 linkifyNames，把一般文字中的現役球員姓名換成 .player-link 按鈕（data-action="player"，含 data-league）。按鈕、select、svg、.profile-header 與 [data-nolink] 內不處理；要排除某區塊就加 data-nolink。player 動作會記住原本的視窗（modal.back），關閉後回去。
- 事件：EVENT_RATE=.25；drawStory 以 s.storyLast（{id:{y,d}}）做冷卻（STORY_COOLDOWN，模板可用 cooldown 覆寫），模板的 leagues 限定聯盟、scene 指定插圖（art.js 讀 STORY_BY_ID）。新模板只能用 cast 鍵 p（打者或任何人）與 q（投手），測試會以真實球員逐一建構並執行每個選項。
- 球員庫（page 'players'）：pdbRows 由各聯盟 rosterFor 組出，搜尋只重繪 #pdb-results 以保留輸入焦點；其他聯盟能力用 ovrView，不洩漏未偵查的真實數值。
- 虛構新人姓名依聯盟（engine.js ROOKIE_NAMES），並避開同聯盟現有球員姓名。
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

## v1.7 GM 第二階段

- dist/gm.js：teamProfile（能力計算的戰力剖面，可帶 moves 做假設交易）、leagueProfiles（依日/交易/傷兵快取的聯盟排名）、teamReport、tradeImpact、首席助理（assistantOf/assistantVerdict/assistantReport/suggestTarget/hireAssistant）。助理存於 s.assistant，advanceSeason 帶入下一季。
- engine.js 交易：offer 改為 {targetTeam, give[], get[], cash}，cash 正數為提案方付、負數為對方付；normOffer 相容舊的 giveId/getId。packageValue 依 1／0.55／0.3 遞減。現金價值依 moneyScale 換算。tradeLog 同時保存 give/get 陣列與 giveId/getId。

## v1.8 GM 模式

- dist/front.js：總教練（s.manager，套用 starterLimit/lineupBias 到使用者球隊）、董事會（s.board，依季重建目標，信任度同隊沿用）、GM 紀錄與稱號（s.gm）、鄉民輿情（s.fans）。透過 engine.HOOKS（globalThis 共用）接上每日結算、交易前與釋出；AI 聯盟（aiOnly）不跑。advanceSeason 會帶上 gm/board/fans/manager。
- engine.js：releaseCheck/releasePlayer（ownership 設為 'FA'，休賽季加入自由球員市場）、isImport/importCount/FOREIGN_LIMIT（交易檢查洋將上限）、autoLineup 可帶 bias、settleDay 記錄主場場次與觀眾並依輿情調整使用者主場觀眾。
- 場外事件（offfield）改為四種輕微情節，使用 clubhouse 選項機制；舊存檔中尚未處理的虛構人物事件仍可照舊處理。
- 被解職：season 結束時 board.result.fired；app 顯示 firedSection，takeJob 會改 w.teamId 與 s.teamId。

## v1.9 合約

- s.salaries：鎖定年薪（salaryFor(s,p)，缺值時退回 salaryOf 行情）；world.ensureContracts 補齊，completeOffseason 依續約、簽約、補人重建並交給下一季。s.pendingSalary：季中提前續約的新年薪，休賽季生效。
- contractAsk/offerOutlook：開價與底線（每季固定）；setExpiringOffer 設定續約開價，completeOffseason 低於底線者進市場並發新聞。o.userControlled 列出自動續約的年輕球員與新年薪。
- 休賽季：startOffseason 設 user.offseasonTrades=true，evaluateTrade/releaseCheck 據此開放；releaseInOffseason 付清剩餘合約並加入 o.freeAgents。
- 季中自由球員：freeAgentPool（s.faPool，每週）、signCheck、signFreeAgent（寫入 s.playerPool，呼叫端需重建 data）。

## v2.0 韓職與 1–100 顯示

- dist/data/roster_kbo.json：v2.1 起由 data_pipeline/update_kbo_wiki.py 產生（韓文維基百科各隊名單模板＋新球員條目的 infobox；以 roster_kbo_20251031.json 為能力來源）。2025 版由 build_kbo.py 從 KBOFM2025 CSV 產生，保留為 roster_kbo_20251031.json。KBO 官網 robots.txt 禁止未經核准的自動收集，不可抓取。姓名轉寫在 data_pipeline/kbo_names_zh.py。
- 名單快照更新與舊存檔：leagues.js 的 LEGACY_ROSTERS 以 generated_at 對應舊快照檔；app 讀檔時 world.legacyRosterNeeds 找出還沒有 playerPool、dataVersion 不同的聯盟，attachLegacyPool 把舊名單（toWorldScale 後）寫進 playerPool，再 restoreWorld。之後更新任何聯盟名單，都要把舊檔保留並登記在 LEGACY_ROSTERS。
- LEAGUE_ORDER 加入 KBO；origin 'KOR'；FOREIGN_LIMIT/FOREIGN_QUOTA KBO 4；LEAGUE_PAY .15；LEAGUE_SCALE 縮小差距（NPB -6、KBO -9、CPBL -12）。restoreWorld 對缺少的聯盟呼叫 addLeague，模擬到使用者聯盟同一天。
- g100(v) 只用於顯示：70 + (v − 50) × 1.6，限制在 1–100；g100delta 用於戰力差。引擎與存檔數值仍是 20–80。
- offseason.market.crossTotal 記錄跨聯盟移動總數。

## v2.8 打席模型

- engine.js 的 plateOdds(s,batter,pitcher,defense) 回傳每個打席的三振、保送、全壘打、安打機率（皆為佔全部打席的比例），以及安打中的二壘、三壘安打比例。simulateGame 只透過它擲骰。
- 安打 = 場內球比例 ×（場內球安打率）。場內球安打率由接觸、力量、速度、位移、球威、控球與 teamDefense 決定，所以三振、守備都會影響失分。
- 跑壘與雙殺依跑者／打者速度調整；用球數在擲出結果後決定。
- tests/ratings-impact.test.js 檢查各能力的影響方向，並跑一個美職球季確認能力與 OPS、防禦率、勝率的相關係數，以及每隊每場 3.8–5.2 分。調整係數後要一併跑這個測試。

## v2.9 WAR

- stats.js：warContext(s)（聯盟 wOBA、WOBA_SCALE、每九局失分、每勝得分 rpw）、batWar(b,ctx,p)（bat/pos/fld/rep 皆為得分，war 為勝場）、pitWar(q,ctx)、playerWar(s,p,ctx)、fmtWar。stats.js 自 engine.js?v=30 匯入 defenseAt、primaryPosition；更新資產版本號時要一起改。
- statRows 多一個 playerOf(id) 參數，打者 WAR 的守位與守備需要球員資料；沒有傳入時守備為 0、未記錄守位的場次算 DH。
- simulateGame 在 s.batting[id].pos 記錄每個守位的出賽場次（依 s.teams[t].fielding）。沒有 pos 或場次不足的部分以主守位計。
- 投手 WAR 用全部失分（RA9），因為本遊戲投手會影響場內球安打率，不適合只用 FIP。守備得分沒有從投手扣除，係數刻意偏小。
- tests/war.test.js 檢查各部分的方向、全聯盟總量與打者比例、守位紀錄，以及球隊 WAR 與得失分差的相關。

## v3.0 寫實照片

- dist/img/ 有 5 張 AI 生成照片（stadium-night、dugout、champion、offseason、office），1600px 寬 WebP。由擁有者用 Gemini 生成；照片不可出現清楚人臉、真實隊徽、可辨識的真實球場或文字。
- app.js：photoBanner(name,alt) 產生辦公室、休賽季的橫幅（figcaption 標示 AI 生成示意圖）；開始畫面 .welcome-intro 與首頁 .season-hero 以 .photo-bg + .photo-stadium/.photo-dugout/.photo-champion 當背景，內含 .photo-note 標示。賽季結束時首頁改用 photo-champion。
- CSS 背景規則用 `:root .photo-bg.photo-x` 提高優先順序，才能蓋過主題的 `html[data-theme=dark] .season-hero{background:…}`。
- 事件視窗不再有插圖；art.js 只剩 defenseDiagram／shortName。stories.js 模板的 scene 欄位已無作用，保留以免動到 139 個模板。
- tests/art.test.js 檢查照片存在、小於 200KB、有被使用，且每個照片位置都有 AI 生成標示。
