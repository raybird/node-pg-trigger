# Firestore-like Realtime SDK Cheatsheet

本文件整理 `pg-trigger-manager/client` 最常用的即時 API，讓前端團隊可快速對照 `onSnapshot / valueChanges / subscribe` 與查詢語法。

## 1) 建立 SDK

```ts
import { createSdk, FieldValue } from "pg-trigger-manager/client";

const sdk = createSdk("http://localhost:5000");
```

## 2) Collection / Query 常用方法

- `collection(name, schema?)`: 取得集合參照。
- `where(field, operator, value)`: 加入過濾條件。
- `orderBy(field, direction?)`: 指定排序。
- `limit(n)`: 取前 `n` 筆。
- `limitToLast(n)`: 取最後 `n` 筆（需先 `orderBy`）。
- `startAt(v)`: 從游標值開始（含）。
- `startAfter(v)`: 從游標值之後開始（不含）。
- `endAt(v)`: 到游標值結束（含）。
- `endBefore(v)`: 到游標值之前結束（不含）。
- `offset(n)`: 偏移筆數。
- `get()`: 取得目前查詢的完整列表。
- `count()`: 回傳目前查詢結果數量。
- `onSnapshot(cb)`: 監聽事件與完整結果快照。
- `valueChanges(cb)`: 只回傳資料本體（陣列）。
- `subscribe(cb)`: `onSnapshot` 別名。

### 支援的 `where` 運算子

`==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `in`, `not-in`, `array-contains`, `array-contains-any`

## 3) Document 常用方法

- `doc(table, id, idField?, schema?)`: 取得文件參照。
- `get()`: 取得單筆資料（不存在回傳 `null`）。
- `exists()`: 檢查文件是否存在。
- `set(data, { merge? })`: Upsert 或局部合併。
- `update(data)`: 更新欄位。
- `delete()`: 刪除文件。
- `onSnapshot(cb)`: 監聽單筆文件快照。
- `valueChanges(cb)`: 只回傳單筆資料本體。
- `subscribe(cb)`: `onSnapshot` 別名。

## 4) Converter 型別映射

```ts
const users = sdk.collection("users").withConverter({
  fromFirestore(row) {
    return {
      id: row.id,
      displayName: row.name,
    };
  },
  toFirestore(model) {
    return {
      name: model.displayName,
    };
  },
});
```

- `Query/Collection/Document` 均支援 `withConverter()`。
- `get()/onSnapshot()/valueChanges()` 輸出都會套用 `fromFirestore`。
- `add()/set()/update()` 輸入會套用 `toFirestore`（若有提供）。

## 5) 解除訂閱模式

```ts
const unsubscribe = await sdk
  .collection("users")
  .where("status", "==", "active")
  .valueChanges((rows) => {
    console.log(rows);
  });

// 離開頁面或元件卸載時
unsubscribe();
```

## 6) 常見錯誤與注意事項

- `limitToLast(n)` 必須搭配至少一個 `orderBy(...)`，否則會丟出錯誤。
- `startAt/startAfter/endAt/endBefore` 也必須搭配 `orderBy(...)`。
- `count()` 目前是以查詢結果長度計算，語意上等同 `await query.get(); rows.length`。
- `onSnapshot` 會先送出 `action: "initial"`，再送出後續增量事件。
- 建議以單一查詢實例維護單一畫面狀態，避免多個訂閱交錯造成 UI 覆蓋。
