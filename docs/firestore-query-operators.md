# Firestore-like Query Operators（in / not-in / array-contains / array-contains-any）

為了讓 `node-pg-trigger` 更接近 Firestore 的查詢手感，SDK 現在支援：

- `where(field, 'in', [...])`
- `where(field, 'not-in', [...])`
- `where(field, 'array-contains', value)`
- `where(field, 'array-contains-any', [...])`

## 用法範例

```ts
import { createSdk } from "pg-trigger-manager/client";

const sdk = createSdk("http://localhost:5000");

sdk
  .collection("users")
  .where("role", "in", ["admin", "editor"])
  .where("status", "not-in", ["deleted", "blocked"])
  .onSnapshot(({ record }) => {
    console.log("符合條件的使用者：", record);
  });

sdk
  .collection("projects")
  .where("tags", "array-contains", "urgent")
  .onSnapshot(({ record }) => {
    console.log("包含 urgent 標籤的專案：", record);
  });

sdk
  .collection("projects")
  .where("tags", "array-contains-any", ["urgent", "p1", "hotfix"])
  .onSnapshot(({ record }) => {
    console.log("包含任一目標標籤的專案：", record);
  });
```

## 行為說明

- `in`: 欄位值落在給定集合時匹配。
- `not-in`: 欄位值不在給定集合時匹配。
- `array-contains`: 陣列欄位包含指定元素時匹配。
- `array-contains-any`: 陣列欄位與給定集合有任一元素交集時匹配。
- 當 `value` 非陣列時，SDK 會自動包成單元素陣列以避免拋錯。
- 支援即時事件過濾，快取會隨新增/更新/刪除事件自動重算。

## 對 PostgreSQL 的映射

- `in` 會轉為 `= ANY($n)`
- `not-in` 會轉為 `NOT (field = ANY($n))`
- `array-contains` 會轉為 `to_jsonb(field) @> jsonb_build_array($n)`
- `array-contains-any` 會轉為 `EXISTS + jsonb_array_elements_text + ANY($n)`

此設計保持 SQL 安全參數化，同時維持 Firestore 風格語法。
