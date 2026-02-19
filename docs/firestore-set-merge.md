# Firestore-like `set()` 與 `merge` 使用指南

本文件說明 `node-pg-trigger` SDK 新增的 `doc.set()` 語法，讓資料寫入流程更貼近 Firestore 的開發體驗。

## 1. 什麼是 `set()`

`set()` 是一種 upsert 操作：

- 文件不存在時：建立新資料。
- 文件已存在時：更新指定欄位。

```ts
const userRef = sdk.collection("users").doc("raybird");

await userRef.set({
  name: "Ray Bird",
  role: "editor",
});
```

## 2. `merge: true` 的語意

`merge` 模式會僅更新你提供的欄位，其他欄位維持不變，適合部分欄位 patch。

```ts
await userRef.set(
  {
    lastSeenAt: FieldValue.serverTimestamp(),
    loginCount: FieldValue.increment(1),
  },
  { merge: true },
);
```

## 3. 與 `update()` 的差異

- `update()`：資料不存在時通常回傳 `null`（不建立新資料）。
- `set()`：資料不存在時會建立，存在時更新。

## 4. 批量寫入中的 `set()`

`WriteBatch` 也支援 `set(..., { merge: true })`：

```ts
const batch = sdk.batch();
const profileRef = sdk.collection("profiles").doc("raybird");

batch.set(profileRef, { points: 10 }, { merge: true });
await batch.commit();
```

## 5. 注意事項

- `set()` 依賴資料表主鍵衝突 (`ON CONFLICT`) 來實作 upsert，請確保 `idField` 對應欄位具備唯一鍵或主鍵約束。
- 若你使用自訂主鍵欄位，可在 `doc(name, id, idField)` 指定。
