# 📋 任務清單：Firestore-like set() + merge 體驗

## 🎯 目標

補齊 Firestore 常用的文件寫入語法，導入 `doc.set(data, { merge })`，降低前端在「新增/更新」分流判斷的心智負擔。

## 🛠 任務分解

- [x] **Phase 1: SDK 介面擴充**
  - [x] 新增 `Document.set(record, options)` API。
  - [x] 新增 `SetOptions`（支援 `merge`）與 `Collection.doc(id)` 快捷語法。
  - [x] 新增 `Query.get()`，補齊 one-shot 查詢能力。
- [x] **Phase 2: Server Upsert 能力**
  - [x] 新增 `data.set` mutation，使用 `ON CONFLICT` 實作 upsert。
  - [x] 支援 `merge: true` 時保留欄位並處理 `FieldValue`。
  - [x] 將 `WriteBatch.set` 擴充為支援 `merge` 選項。
- [x] **Phase 3: 文件與決策同步**
  - [x] 更新 `README.md`，新增 `set()` 與 `merge` 範例。
  - [x] 新增 `docs/firestore-set-merge.md` 教學說明。
  - [x] 建立 ADR：`docs/decisions/0066-firestore-set-merge-upsert.md`。
  - [x] 更新 `ROADMAP.md` 進度紀錄。
