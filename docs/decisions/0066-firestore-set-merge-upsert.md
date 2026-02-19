# ADR 0066: Firestore-like `set()` 與 `merge` Upsert 策略

## 狀態

Accepted

## 背景

目前 SDK 已有 `add/update/delete`，但前端在實作「資料可能存在也可能不存在」的場景時，仍需手動判斷分流。這與 Firestore 的 `set()`（可直接 upsert）體驗存在落差。

## 決策

1. 在 SDK `Document` 新增 `set(record, options)`。
2. 新增 `SetOptions`，先支援 `merge?: boolean`。
3. 在 server 新增 `data.set` mutation，以 `INSERT ... ON CONFLICT ... DO UPDATE` 實作。
4. 在 `WriteBatch.set` 同步支援 `merge`，保持單筆與批次語意一致。

## 後果

- **優點**：前端不需自行處理「新增 vs 更新」分流，減少樣板程式。
- **優點**：API 更接近 Firestore，學習曲線更平滑。
- **代價**：`set` 依賴主鍵/唯一鍵衝突策略，需確認 `idField` 對應索引設計。
