# ADR 0067: 補齊 Firestore 風格 `array-contains` / `array-contains-any` 查詢運算子

## 狀態

已接受 (Accepted)

## 背景

目前 SDK 已支援 `in` / `not-in`，但在常見的標籤（tags）、權限列表（roles）等陣列欄位場景，仍缺少 Firestore 開發者常用的 `array-contains` / `array-contains-any`。這會迫使前端改用非直覺語法或手動二次過濾。

## 決策

1. SDK `FilterOperator` 新增 `array-contains` 與 `array-contains-any`。
2. 客戶端快取過濾器 `matchesFilters()` 新增陣列包含/任一命中判斷。
3. Server 查詢編譯新增 SQL 映射：
   - `array-contains` -> `to_jsonb(field) @> jsonb_build_array($n)`
   - `array-contains-any` -> `EXISTS (SELECT 1 FROM jsonb_array_elements_text(to_jsonb(field)) ... = ANY($n))`
4. `array-contains-any` 若傳入非陣列值，採單元素陣列容錯策略。

## 後果

- **優點**：查詢語意更接近 Firestore，降低學習與遷移成本。
- **優點**：初始查詢與即時事件過濾可維持一致行為。
- **代價**：`array-contains-any` 目前以字串比對 JSON array 元素，混合型別欄位需由使用者先規範資料形狀。
