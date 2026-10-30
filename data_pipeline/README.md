# CPBL / MLB roster pipeline (PRD §2 MVP)

Python 3.10+。不需要 API key。此階段僅實作 MLB 與 CPBL。

## 執行

從專案根目錄執行：

```bash
python -m pip install -r data_pipeline/requirements.txt
python data_pipeline/fetch_rosters.py
```

預設讀取今年名單、近三個球季（包含今年）的一軍例行賽成績，寫入：

- `public/data/roster_mlb.json`
- `public/data/roster_cpbl.json`

可分開執行：

```bash
python data_pipeline/fetch_rosters.py --leagues mlb
python data_pipeline/fetch_rosters.py --leagues cpbl
python data_pipeline/fetch_rosters.py --leagues mlb --season 2025 --years 2
python data_pipeline/fetch_rosters.py --leagues mlb --roster-type active --refresh
python -m unittest discover -s tests -v
```

`--years` 支援 1、2、3。MLB 預設 `40Man`，包含 40 人名單內的一軍、部分小聯盟與傷兵球員；需比賽當下一軍名單可改 `active`。所有成績只採 MLB 級別例行賽，不混入 MiLB。名單型態不保證每隊剛好 40 人，且名單外傷兵不一定包含。

CPBL 採六隊官方現役球團頁，包括頁面列出的已登錄／培訓球員，不宣稱是當日一軍登錄名單。球團頁只提供現況，因此不接受歷史 `--season`。球隊代碼集中在 `CPBL_TEAMS`，聯盟擴編或改名時可在一處修改。

## 資料來源與抓取策略

- MLB：`https://statsapi.mlb.com/api/v1`，依序讀取 teams、每隊 roster、每批最多 40 人的 people yearByYear 成績。跨隊球員採分隊成績，避開年度總計重複加總。保留大谷等二刀流的投打能力。
- CPBL：`https://www.cpbl.com.tw/team?ClubNo=...`，透過永久 `Acnt` 取得球員 ID，再抓 `team/person?Acnt=...&KindCode=A` 的年度成績表。依中文表頭辨識打擊／投球／守備數據，不依賴排名與固定欄位順序；無法辨識版型時停止該聯盟。
- 每次請求有 timeout；429 與暫時性 5xx 最多重試三次。CPBL 請求預設間隔 0.35 秒，可用 `--cpbl-delay` 調整。
- 本機快取有效六小時，`--refresh` 可重抓；不會在失敗時回退到過期快取。
- 每個聯盟獨立完成與寫入。任何聯盟失敗，程式以 exit code 1 結束；已成功的聯盟仍可產出。錯誤／空資料不覆蓋既有檔案，JSON 採暫存檔與原子替換。

## 評級方法

PRD 沒有指定各項權重與資料不足政策，此版本將它們明確化，集中在 `FORMULAS` 與 `rate_players()`，方便之後調整。

先加權累積計數，再重算比率：近三季權重依新到舊為 3、2、1（近兩季為 2、1），不直接平均 AVG 或 ERA。投球局數先轉出局數，`100.2` 代表 302 個出局數。

參考族群是「抓取名單內近年未加權合計至少 100 PA 的打者／90 outs 的投手」，每個聯盟分開建立平均與母體標準差。參考族群因此是現役名單成員，並非整個歷史聯盟全部出賽者。

每項指標轉成 z 分數，再依下表加權成能力，轉為 `50 + 10 × z`，取整數並限制在 20–80。缺少部分指標時對可用權重重新正規化；全部缺少或參考族群無變異時給中性 50，並註明原因。

| 能力 | 指標權重 |
| --- | --- |
| Contact | AVG 70%、反向 K/PA 30% |
| Power | ISO 80%、HR/PA 20% |
| Eye | BB/PA 80%、BB/K 20% |
| Speed | SB/PA 80%、3B/AB 20% |
| Stuff | K/9 100% |
| Control | 反向 BB/9 100% |
| Movement | 反向 HR/9 100% |
| Defense | 同守位球員的守備率 z 分數；無資料給 50，DH 給 35 |
| Stamina | 先發比例 ≥50% 視為 SP，給 60–75；RP/CL 給 30–45；無出賽定位給 50 |

小樣本往 50 收縮：打擊採 `PA/(PA+100)`，投球採 `outs/(outs+90)`；守備採 `守備機會/(守備機會+100)`。因此最終分布不保證平均恰為 50、標準差恰為 10，尤其經過多指標加權、裁切與缺值先驗後。這是明示的 MVP 穩健化處理。

這是模擬用途的能力估計，不是官方 OOTP 評分，也不是球探的未來潛力評估。不同聯盟的 60 分不能直接比較真實戰力。球速、GB%、DRS、UZR 尚未接入；不以滾飛「出局」比例冒充 GB%，也不以虛構隨機值補缺。盜壘與三壘安打受到策略／球場影響，守備率無法完整反映守備範圍。

## JSON 介面

頂層包括：

- `schema_version`、`league`、`season`、`generated_at`（UTC）
- `roster_scope`、`stats_seasons`、`sources`
- `rating_model`：版本、權重、參考平均與標準差、限制
- `teams`：`id`、`source_id`、`name`
- `players`：如下

```json
{
  "id": "cpbl:0000000001",
  "source_id": "0000000001",
  "name": "範例球員（格式示意，非真實資料）",
  "team_id": "cpbl:ADD",
  "position": "SS",
  "status": "registered",
  "season_stats": [],
  "ratings": {"contact": 50, "power": 50, "eye": 50, "speed": 50, "defense": 50},
  "rating_quality": {"contact": {"method": "neutral_no_data", "sample": 0, "reliability": 0, "used_metrics": []}},
  "metrics": {"avg": null}
}
```

投手另有 `role`（SP/RP/CL/P）與 `stuff/control/movement/stamina`。純投手不強制生成打者能力；有打擊成績的投手及 TWP 可同時有兩套能力。每個 `season_stats` 元素含 `season`、`group`、`stats`，部分來源另含 `position`。缺失值用 `null`，與真實的零分開；不產生 NaN/Infinity。球員 ID 使用聯盟前綴，CPBL 的前導零不會遺失。

## 本次驗證與已知限制

- 2026-10-30 實際跑通 MLB 官方來源：30 隊、1,189 名球員；隨附 `roster_mlb.json` 是這次抓取的快照，非即時資料。
- 10 項離線測試涵蓋局數轉換、轉隊重複總計、MiLB 排除、中文 CPBL 名單與年度表格解析、加權率、反向評級、二刀流、缺值、原子寫入及失敗保留舊檔。
- **CPBL 在目前執行環境回傳 HTTP 404，無法以真實回應完成整條管線驗證，沒有產出假冒的 `roster_cpbl.json`。** 目前 CPBL 解析器僅通過合成 HTML 測試；官方網站若改成 JavaScript 載入、拆分表格或不同 DOM，需要先取得實際回應，再調整解析器。這部分不能視為已完成線上驗收。
- CPBL 各類賽事的隔離依賴官方 `KindCode=A` 回應；需在能連線的環境確認該頁確實僅回傳一軍例行賽。尚未透過真實 HTML 驗證前，不建議將 CPBL 輸出當作已核對資料。
- 新人沒有任何成績仍保留於名單、能力採中性值；若整個聯盟都沒有成績，則視為來源或解析異常並拒絕發布。
