# 📋 任務清單：Firestore-like `withConverter` 模型映射體驗

## 🎯 目標

補齊 Firestore-like 模型轉換能力，導入 `withConverter()` 讓 SDK 可集中處理欄位映射與型別轉換，降低前端資料層重複轉換成本。

## 🛠 任務分解

- [x] **Phase 1: Converter API 擴充**
  - [x] 新增 `Query.withConverter()` 並保留既有查詢鏈狀態。
  - [x] 新增 `Collection.withConverter()` 與 `Document.withConverter()`。
- [x] **Phase 2: 讀寫流程轉換整合**
  - [x] 讀取流程套用 `fromFirestore`（`get` / `onSnapshot` / `valueChanges`）。
  - [x] 寫入流程套用 `toFirestore`（`add` / `update` / `set` / `delete` 回傳轉換）。
- [x] **Phase 3: 測試與文件同步**
  - [x] 新增 converter 行為測試（Query / Collection / Document）。
  - [x] 更新 `README.md` 與 `ROADMAP.md` 使用說明。
- [x] **Phase 4: 編譯輸出同步**
  - [x] 同步更新 `src/client/index.js`，與 TypeScript 來源一致。
