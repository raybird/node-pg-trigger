# 📋 任務清單：Firestore-like `count/exists` 易用性補強

## 🎯 目標

補齊 Firestore 常見的讀取輔助語意，導入 `query.count()` 與 `doc.exists()`，讓前端可更直覺地完成統計與存在性檢查。

## 🛠 任務分解

- [x] **Phase 1: API 擴充**
  - [x] 新增 `Query.count()` 直接回傳目前查詢結果數量。
  - [x] 新增 `Document.exists()` 回傳文件是否存在。
- [x] **Phase 2: 測試與文件同步**
  - [x] 新增 `count/exists` 行為測試。
  - [x] 更新 `README.md` 與 `ROADMAP.md` 使用說明。
- [x] **Phase 4: 編譯輸出同步**
  - [x] 同步更新 `src/client/index.js`，與 TypeScript 來源一致。

---

## 📋 任務清單：SDK 文件完整度補強

## 🎯 目標

補齊前端開發者最常用的即時 API 速查，降低 onboarding 成本，讓 `onSnapshot / valueChanges / subscribe / count / exists / withConverter` 可在單一文件快速定位。

## 🛠 任務分解

- [x] **Phase 1: 速查文件建立**
  - [x] 新增 `docs/firestore-realtime-cheatsheet.md`。
  - [x] 整理 Query/Document 常用 API 與解除訂閱模式。
- [x] **Phase 2: 主 README 導覽補強**
  - [x] 在 `README.md` 新增文件快速入口區塊。
  - [x] 在 SDK 章節加入速查文件指引。

---

## 📋 任務清單：Cursor 分頁語法補強

## 🎯 目標

補上 Firestore 常用 cursor 視窗語法，提供 `startAt/startAfter/endAt/endBefore`，讓前端能用時間戳或排序欄位進行更直覺的區間分頁。

## 🛠 任務分解

- [x] **Phase 1: Query API 擴充**
  - [x] 新增 `startAt(value)` / `startAfter(value)`。
  - [x] 新增 `endAt(value)` / `endBefore(value)`。
  - [x] 若未搭配 `orderBy` 使用 cursor，明確拋錯提示。
- [x] **Phase 2: 測試補齊**
  - [x] 新增 `tests/query-cursors.test.js` 覆蓋 `get/onSnapshot` 與錯誤情境。
- [x] **Phase 3: 文件同步**
  - [x] 更新 `README.md` 查詢範例與語法清單。
  - [x] 更新 `docs/firestore-realtime-cheatsheet.md`。

---

## 📋 任務清單：文件站教學細節補強

## 🎯 目標

補強 docs 站內的安裝與 SDK 教學密度，降低第一次接入時的卡點與排查成本。

## 🛠 任務分解

- [x] **Phase 1: 安裝文件補齊**
  - [x] 補充前置需求、最小資料表與快速驗證流程。
  - [x] 增加常見問題排查（事件、RLS、WebSocket）。
- [x] **Phase 2: SDK 教學擴充**
  - [x] 補齊 onSnapshot / valueChanges / subscribe / Document CRUD。
  - [x] 補齊 cursor 視窗、count、FieldValue、withConverter 範例。
- [x] **Phase 3: 導覽同步**
  - [x] 更新 `README.md` 文件快速入口，串接 docs 站內頁面。

---

## 📋 任務清單：關聯數據展開 (Relation Embedding)

## 🎯 目標

實作自動化的關聯資料解析機制，支援 `1:1` 與 `1:N` 的展開，減少前端手動處理 Join 的負擔。

## 🛠 任務分解

- [x] **Phase 1: SDK 語法實作**
  - [x] 新增 `withRelation(name, table, local, target, type)`。
- [x] **Phase 2: 解析邏輯開發**
  - [x] 在 `Query` 與 `Document` 實作遞迴式的 `resolveRelations`。
  - [x] 整合 `onSnapshot` 訂閱事件連動更新。
- [x] **Phase 3: 穩定性優化**
  - [x] 修正代碼語法與拼字錯誤。
  - [x] 整合持久化快取（處理展開後的資料儲存）。
- [x] **Phase 4: 文件同步**
  - [x] 更新 `README.md` 範例。
  - [x] 更新 `ROADMAP.md` 狀態。
