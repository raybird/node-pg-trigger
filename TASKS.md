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
