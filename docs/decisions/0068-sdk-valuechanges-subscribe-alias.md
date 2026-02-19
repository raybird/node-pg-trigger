# ADR 0068: 導入 `valueChanges` 與 `subscribe` 訂閱命名別名

## 狀態

已接受 (Accepted)

## 背景

目前 SDK 主要使用 `onSnapshot`。雖然語意完整，但在實務遷移上，部分團隊偏好：

- `valueChanges`：只拿資料本體，不處理事件中繼欄位。
- `subscribe`：更貼近 Rx/串流語意的命名。

若僅提供 `onSnapshot`，容易讓跨框架遷移者在命名習慣上產生摩擦。

## 決策

1. 在 `Query` 與 `Document` 新增 `valueChanges(callback)`。
   - `Query.valueChanges` 回呼簽名為 `(records: T[]) => void`。
   - `Document.valueChanges` 回呼簽名為 `(record: T | null) => void`。
2. 在 `Query` 與 `Document` 新增 `subscribe(callback)`，作為 `onSnapshot` 的等價別名。
3. 以上別名皆委派既有 `onSnapshot` 流程，不新增獨立事件管線。

## 後果

- **優點**：降低 Firestore / Rx 風格 API 遷移成本。
- **優點**：不改變既有事件語意，風險低、相容性高。
- **代價**：API 面增加，文件需清楚說明三者差異。
