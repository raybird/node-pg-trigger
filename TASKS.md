# 📋 任務清單：Firestore-like `valueChanges` / `subscribe` 訂閱體驗

## 🎯 目標

補齊 Firestore-like 訂閱語意中的命名彈性，導入 `valueChanges`（只回傳資料）與 `subscribe`（`onSnapshot` 別名），降低從 Firestore/Rx 類 API 遷移的學習成本。

## 🛠 任務分解

- [x] **Phase 1: SDK API 擴充（Collection/Query）**
  - [x] 新增 `Query.valueChanges(callback)`，只回傳 `record`。
  - [x] 新增 `Query.subscribe(callback)`，作為 `onSnapshot` 等價別名。
- [x] **Phase 2: SDK API 擴充（Document）**
  - [x] 新增 `Document.valueChanges(callback)`，支援 `T | null`。
  - [x] 新增 `Document.subscribe(callback)`，作為 `onSnapshot` 等價別名。
- [x] **Phase 3: 文件與 Roadmap 同步**
  - [x] 更新 `README.md` 使用範例與語意說明。
  - [x] 更新 `ROADMAP.md` Firestore-like API 完成項目。
- [x] **Phase 4: 編譯輸出同步**
  - [x] 同步更新 `src/client/index.js`，與 TypeScript 來源一致。
