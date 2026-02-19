# 📋 任務清單：Firestore-like `array-contains` / `array-contains-any` 查詢體驗

## 🎯 目標

補齊 Firestore 常見的陣列查詢語法，導入 `where(field, 'array-contains', value)` 與 `where(field, 'array-contains-any', values)`，讓 SDK 在標籤/角色等陣列場景更直覺可用。

## 🛠 任務分解

- [x] **Phase 1: SDK 查詢語意擴充**
  - [x] `FilterOperator` 新增 `array-contains`。
  - [x] `FilterOperator` 新增 `array-contains-any`。
  - [x] 客戶端事件過濾 `matchesFilters()` 支援陣列包含判斷。
- [x] **Phase 2: Server SQL 映射**
  - [x] `data.list` 的 filter parser 新增 `array-contains`。
  - [x] `data.list` 的 filter parser 新增 `array-contains-any`。
  - [x] SQL 以 `to_jsonb(field) @> jsonb_build_array($n)` 參數化處理。
  - [x] SQL 以 `EXISTS + jsonb_array_elements_text + ANY($n)` 參數化處理。
- [x] **Phase 3: 文件同步**
  - [x] 更新 `docs/firestore-query-operators.md`。
  - [x] 更新 `README.md` 查詢運算子範例與清單。
- [x] **Phase 4: 驗證**
  - [x] 已執行 TypeScript 編譯檢查；目前專案存在既有依賴/型別錯誤，非本次變更單獨造成。
