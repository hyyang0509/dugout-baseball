# 簡易版棒球球團經營與模擬遊戲 (OOTP Lite) - MVP 產品需求文件 (PRD)

**版本**：v2.0 (已納入真實獨立聯盟模式、動態狀態、突發事件系統與 Python 爬蟲規範)  
**目標**：作為完整、高精準度的架構規格書，可直接提供給任何 AI 編程工具（如 Claude、Cursor、ChatGPT）分模組生成可執行的 MVP 代碼。

---

## 1. 產品定位與核心玩法閉環 (Core Loop)

### 1.1 產品定位
一款輕量化、免安裝、支援手機與電腦隨開隨玩的網頁版棒球經營與賽事模擬遊戲。專注於**「球團名單管理」**、**「球員狀態調度」**、**「突發危機處理」**與**「高速比賽模擬」**。

### 1.2 核心賽制架構（真實世界獨立模式）
* **單一聯盟閉環**：玩家在開局時選擇 **1 個聯盟中的 1 支球隊**（例如：CPBL 統一獅、NPB 阪神虎、MLB 洛杉磯道奇）。
* **真實世界賽程**：僅與同聯盟球隊進行例行賽，爭取季後賽名額與聯盟總冠軍（如台灣大賽、日本一、世界大賽）。暫不進行跨聯盟交流賽。
* **每日/每週循環**：
  ```
  [處理突發事件與危機決策] 
         ↓
  [檢視球員狀況 (🔥手感發燙 / ❄️低潮 / 體力疲勞 / 傷兵名單 IL)] 
         ↓
  [調整先發打序 1~9 棒與先發/牛棚投手調度] 
         ↓
  [一鍵模擬單日/單週賽程] (極速完成，50ms/場) 
         ↓
  [戰報檢視 (Box Score + 關鍵勝負 Highlight 條列)] 
         ↓
  [即時戰績與個人排行榜累積] 
         ↓
  [免帳號 6 位數雲端自動同步存檔]
  ```

---

## 2. 五大聯盟資料抓取腳本規格 (Python Data Pipeline)

### 2.1 支援聯盟與數據源
提供一個獨立的 Python 抓取與清洗腳本 (`data_pipeline/fetch_rosters.py`)，定期抓取最新現役名單與成績：
* **MLB & MiLB (3A/2A)**：使用 `pybaseball` 庫或直接呼叫 MLB 官方公開 API (`https://statsapi.mlb.com/api/v1`)。
* **NPB**：抓取 Baseball-Reference 或 Yahoo Japan NPB 公開名單。
* **KBO**：抓取 KBReport 或 Baseball-Reference KBO 名單。
* **CPBL**：抓取 CPBL 官方名單網站或野球魂/維基數據。

### 2.2 真實數據轉 20–80 OOTP 評級演算法 (Rating Mapping)
腳本將真實累積數據（近 1~3 季成績）正規化映射至 20–80 分制（50 為聯盟平均，標準差 10）：

#### 打者屬性映射公式：
* **Contact (接觸)**：由打擊率 (AVG) 與三振率 (K%) 加權推導：
  $$\text{Contact} = 50 + \left(\frac{\text{AVG} - \mu_{\text{AVG}}}{\sigma_{\text{AVG}}}\right) \times 10$$
* **Power (長打)**：由純長打率 (ISO = SLG - AVG) 與全壘打率推導。
* **Eye (選球)**：由保送率 (BB%) 與三振保送比 (BB/K) 推導。
* **Speed (速度)**：由歷史盜壘數 (SB)、三壘安打與跑壘數據推導。
* **Defense (守備)**：依守位難度與進階守備率 (DRS/UZR/守備率) 映射。

#### 投手屬性映射公式：
* **Stuff (球威)**：由三振率 (K/9 或 K%) 與速球均速推導。
* **Control (控球)**：由保送率 (BB/9 或 BB%) 反向推導（低 BB/9 = 高 Control）。
* **Movement (位移/壓制力)**：由被全壘打率 (HR/9) 與滾地球率 (GB%) 推導。
* **Stamina (體力)**：依定位分配（先發 SP 基本 60~75，牛棚 RP/CL 基本 30~45）。

### 2.3 輸出規格
產出 5 個標準化靜態 JSON 檔案放置於前端靜態目錄（`public/data/`）：
* `roster_mlb.json`、`roster_milb.json`、`roster_npb.json`、`roster_kbo.json`、`roster_cpbl.json`

---

## 3. 球員動態狀況與體力系統 (Condition & Fatigue)

### 3.1 短期手感與狀態波動 (Form)
球員並非固定數值，每日模擬前會根據隨機震盪與近期表現更新狀態標籤：
* **🔥 手感火燙 (Hot Streak)**：全能力 +8% ~ +12%，維持 3~7 天。
* **✨ 狀況良好 (Good Form)**：全能力 +3% ~ +5%。
* **😐 平常狀態 (Normal)**：標準數值 (100%)。
* **📉 輕微疲態 (Tired)**：體力衰退速度增加 20%。
* **❄️ 手感冰冷 (Slump)**：Contact / Control 下降 10%，維持 3~10 天。

### 3.2 投手體力與輪值疲勞 (Pitcher Fatigue)
* **先發投手 (SP)**：投滿 80~100 球後體力歸零，需休 4~5 天體力才完全回滿；若強行「投一休三」，Stuff 與 Control 懲罰 30%，大幅增加受傷機率。
* **牛棚中繼 (RP/CL)**：
  * 連續出賽 2 天：狀態變為「疲勞」，球威下降 15%。
  * 連續出賽 3 天：極度疲勞，受傷機率暴增 5 倍。

---

## 4. 隨機突發事件與球團危機決策系統 (Random Events Engine)

### 4.1 事件觸發機制
在每日模擬結算前，系統有 5%~15% 的機率觸發 1 則隨機事件，以彈窗（Modal）通知玩家並要求決策。

### 4.2 事件分類與範例庫

#### A. 傷病系統 (Injuries)
* **輕度 (Day-to-Day, DTD)**：水泡、肌肉輕微拉傷。可帶傷上陣（能力減半），或休息 2~5 天。
* **中度 (10/15-Day IL)**：腿部拉傷、肋骨挫傷，強制休養 2~4 週。
* **重度 (Season-Ending)**：手肘韌帶撕裂（Tommy John 手術）、肩關節唇撕裂，整季報銷。

#### B. 場外爭議與緋聞危機 (Off-Field Scandals)
* **酒駕被逮 (DUI Arrest)**：
  * *選項 1*：嚴厲懲處，直接解約或禁賽 30 場（球隊士氣上升，但戰力受損）。
  * *選項 2*：公開道歉並內部罰款，不停賽（媒體與球迷抗議，球迷滿意度 -20，可能面臨聯盟後續追加罰款）。
* **桃色緋聞/深夜夜店被拍 (Tabloid Scandal)**：
  * 球員陷入輿論風暴，手感直接轉為 ❄️ 冰冷，持續 2 週。
* **更衣室肢體衝突 (Clubhouse Brawl)**：
  * 當家球星與年輕新秀大打出手。玩家可選擇「力挺球星」或「各打五十大板」，影響個別球員士氣與球隊默契。

#### C. 正向驚喜事件 (Positive Breakthroughs)
* **自主訓練開竅**：年輕新秀休賽期/空檔領悟新球種或揮棒軌跡改裝，某項評級永久 +5。
* **老將精神喊話**：老將帶動全隊氣氛，全隊連續 3 場進入 🔥 爆發狀態。

---

## 5. 比賽模擬與高光戰報引擎 (Sim Engine)

### 5.1 打席判定演算法 (At-Bat Engine)
採用隨機加權矩陣快速結算，單場 9 局 50ms 內完成：
1. **修正能力計算**：$\text{實際能力} = \text{基礎評級} \times \text{狀態係數} \times \text{體力係數}$
2. **投打對決對數公式 (Log5 Odds Formula)**：計算該打席之三振 (K)、保送 (BB)、滾球 (GB)、飛球 (FB)、平飛球 (LD)。
3. **場內球結算 (BABIP & Defense)**：結合防守球員守備評級計算失誤率與安打率。

### 5.2 戰報與勝負焦點產出 (Box Score + Highlights)
* **標準記分板 (Box Score)**：兩隊 R/H/E 局記分板、打擊成績、投球成績（勝/敗/救援）。
* **賽事焦點 (Top 5~8 Key Moments)**：以進階勝率貢獻值 (WPA / Leverage Index) 提取關鍵 Play，產出精簡生動的文字回顧：
  * *例*：「【7局下】雙方 2:2 平手滿壘，陳傑憲擊出右外野深遠二壘安打，掃回 3 分逆轉戰局！」
  * *例*：「【9局下】終結者在領先一分、一二壘有人時連續飆出 2 次再見三振，守住勝果！」

---

## 6. 免帳號 6 位數存檔與跨端同步架構 (Cloud Sync)

### 6.1 零摩擦跨機同步流程
* **存檔碼產生**：玩家進入遊戲，系統自動產生唯一的 **6 位英數代碼**（例如：`K7X9B2`）與對應的 **QR Code**。
* **資料流設計**：
  * **本機端 (Offline-First)**：使用瀏覽器內建 `IndexedDB`（Dexie.js 封裝）隨時自動儲存。
  * **雲端備份 (Cloud Mirror)**：每當玩家完成一場模擬或做出調度，將存檔 JSON 壓縮（LZ-String）後非同步上傳至雲端 KV 儲存（Cloudflare Workers KV 或 Supabase Database）。
  * **跨裝置載入**：在手機或另一台電腦打開遊戲網頁，點擊「輸入存檔碼」或「掃描 QR Code」，即可立刻下載該存檔，完全無需填寫 Email、密碼或綁定社群帳號！

---

## 7. 前端 UI/UX 頁面規格 (Mobile-First)

* **底部/側邊 4 大核心導航**：
  1. **首頁 (Dashboard & Game)**：
     * 今日對手隊徽、雙方先發投手預告。
     * 「模擬今日比賽」/「模擬本週 (6場)」主按鈕。
     * 最新賽況結果彈窗（記分板 + 5 大焦點事件）。
  2. **名單與打序 (Roster & Lineup)**：
     * 1~9 棒先發打線安排（支援拖曳排序或直接替換，標示 🔥/❄️ 狀態圖示）。
     * 先發 5 人輪值、長中繼、佈局、終結者設定。
     * 傷兵名單 (IL) 與二軍升降調度。
  3. **戰績榜與數據庫 (Standings & Leaders)**：
     * 聯盟分區勝差表。
     * 打擊榜（AVG / HR / RBI / OPS）、投手榜（ERA / W / SV / K）。
  4. **球團辦公室與存檔 (Front Office & Settings)**：
     * 顯示 6 位數同步碼與 QR Code。
     * 歷史突發事件日誌。

---

## 8. 技術棧建議 (Tech Stack)

* **前端介面**：Next.js (App Router) 或 Vite + React 18 + TypeScript
* **樣式與元件**：Tailwind CSS + shadcn/ui + Lucide Icons（行動端觸控體驗優異）
* **狀態管理**：Zustand（支援 `persist` 中間件直接綁定 IndexedDB）
* **本地資料庫**：Dexie.js (IndexedDB 封裝)
* **雲端同步後端**：
  * 免費輕量首選：**Supabase (PostgreSQL + REST API)**，建立單一表 `saves(sync_code text primary key, save_data jsonb, updated_at timestamp)`。
* **資料抓取工具**：Python 3.10+ (`pybaseball`, `requests`, `beautifulsoup4`, `pandas`)
