# Firestore-like Query Operators（in / not-in）

為了讓 `node-pg-trigger` 更接近 Firestore 的查詢手感，SDK 現在支援：

- `where(field, 'in', [...])`
- `where(field, 'not-in', [...])`

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
```

## 行為說明

- `in`: 欄位值落在給定集合時匹配。
- `not-in`: 欄位值不在給定集合時匹配。
- 當 `value` 非陣列時，SDK 會自動包成單元素陣列以避免拋錯。
- 支援即時事件過濾，快取會隨新增/更新/刪除事件自動重算。

## 對 PostgreSQL 的映射

- `in` 會轉為 `= ANY($n)`
- `not-in` 會轉為 `NOT (field = ANY($n))`

此設計保持 SQL 安全參數化，同時維持 Firestore 風格語法。
