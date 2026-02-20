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
