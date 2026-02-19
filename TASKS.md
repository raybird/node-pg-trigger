# 📋 任務清單：Firestore-like in / not-in 查詢支援

## 🎯 目標

補齊 Firestore 常用的集合查詢語法，讓 SDK 在條件表達上更貼近 `onSnapshot + where` 的真實開發場景。

## 🛠 任務分解

- [x] **Phase 1: SDK 條件語法擴充**
  - [x] 擴充 `FilterOperator`，新增 `in` 與 `not-in`。
  - [x] 更新客戶端 `matchesFilters` 快取比對邏輯。
- [x] **Phase 2: Server SQL 轉譯**
  - [x] 更新 Zod 驗證，允許 `in` / `not-in`。
  - [x] 在 `buildWhereClause` 新增 `ANY(...)` 參數化查詢映射。
- [x] **Phase 3: 文件與決策同步**
  - [x] 更新 `README.md` 查詢範例與運算子列表。
  - [x] 新增 `docs/firestore-query-operators.md` 使用說明。
  - [x] 建立 ADR：`docs/decisions/0065-firestore-in-not-in-operators.md`。
  - [x] 更新 `ROADMAP.md` 進度紀錄。
