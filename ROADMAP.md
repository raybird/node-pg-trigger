# 🚀 Node-PG-Trigger 演進藍圖 (Roadmap)

本專案的終極目標是為 PostgreSQL 提供如同 Firebase Firestore 般優雅、實時且易用的前端 SDK，讓開發者能以 `onSnapshot` 或 `valueChanges` 的方式即時獲取資料變動。

## 📍 當前階段：核心機制建立 (Completed/Current)

- [x] 基於 `LISTEN/NOTIFY` 的資料庫變更監聽。
- [x] tRPC Subscriptions 實時推送架構。
- [x] 動態觸發器 (Triggers) 管理 API。
- [x] 基礎型別安全 (Type-safety)。

## 🛠 階段一：SDK 語法糖與抽象化 (Completed)

- [x] **Firestore-like API 實作**：
  - [x] `collection('users').onSnapshot(callback)` 語法封裝。
  - [x] `doc('users', 'id').onSnapshot(callback)` 單一文件監聽。
  - [x] `valueChanges(callback)` 與 `subscribe(callback)` 命名別名，降低框架遷移摩擦。
  - [x] `withConverter()` 模型映射，支援 from/to Firestore 欄位轉換。
  - [x] SDK Realtime Cheatsheet 文件，集中整理常用 API 與解除訂閱模式。
  - [x] 文件站安裝/SDK 教學細節化，補齊前置需求、排查與 cursor/FieldValue 範例。
- [x] **自動快取與補丁 (Client-side Caching)**：
  - [x] 前端自動獲取初始快照 (Initial Snapshot Fetching)。
  - [x] 接收到變更事件時自動維護 Local State 並回傳完整快照。
  - [x] **樂觀 UI 更新 (Optimistic Updates)**：寫入操作立即觸發本地回呼。
  - [x] **快照元數據 (Snapshot Metadata)**：支援 `hasPendingWrites` 標記。
  - [x] **離線持久化 (Offline Persistence)**：基於 IndexedDB 儲存快照，支援頁面重載即時顯示（`fromCache`）。
- [x] **CRUD 操作支援**：
  - [x] `collection.add(data)` 實作。
  - [x] `doc.update(data)` 實作。
  - [x] `doc.delete()` 實作。
  - [x] `doc.set(data, { merge })` upsert 與部分欄位合併。
  - [x] `doc.exists()` 文件存在性檢查。
- [x] **進階查詢支援 (Querying)**：
  - [x] 實作 `where()`, `orderBy()`, `limit()` 鏈式語法。
  - [x] 補齊 Firestore 風格 `limitToLast()` 查詢窗口（需搭配 `orderBy`）。
  - [x] 補齊 Firestore 風格 cursor 視窗 `startAt/startAfter/endAt/endBefore`（需搭配 `orderBy`）。
  - [x] 提供 `count()`、`sum()`、`average()` 等伺服器端高效聚合查詢 (Aggregation)。
  - [x] Server 端支援動態 SQL 過濾條件生成。
  - [x] Client 端支援實時事件的條件匹配 (Event Filtering)。
  - [x] 補齊 Firestore 風格集合運算子 `in` / `not-in`。
  - [x] 補齊 Firestore 風格陣列運算子 `array-contains` / `array-contains-any`。
- [x] **伺服器端原子操作 (FieldValue)**：
  - [x] 實作 `FieldValue.serverTimestamp()`。
  - [x] 實作 `FieldValue.increment(n)` 原子增量。
  - [x] 實作 `FieldValue.delete()` 欄位刪除。
  - [x] 實作 `FieldValue.arrayUnion()` 與 `FieldValue.arrayRemove()`。
- [x] **批量寫入 (Write Batches)**：
    - [x] 實作 `sdk.batch()` 介面。
    - [x] 支援將多個異動封裝在單一原子交易中執行。
- [x] **讀寫交易 (Transactions)**：
    - [x] 實作 `sdk.runTransaction()` 介面。
    - [x] 支援樂觀鎖 (Optimistic Locking) 與自動衝突重試。
## 🔒 階段二：安全性與可靠性 (Completed)

- [x] **連線恢復機制**：
  - [x] 在 DB Payload 中加入 `txid` (交易 ID) 作為事件序號。
  - [x] 建立 `audit_log` 資料表持久化異動歷史。
  - [x] 實作自動斷線重連後的資料追補 (Re-sync via `lastTxid`)。
- [x] **Row-Level Security (RLS) 整合**：
  - [x] 實作 SDK `auth()` 與 `signOut()` 介面。
  - [x] tRPC Context 整合使用者身分提取 (Headers & WS Query)。
  - [x] 資料庫層支援 `SET LOCAL "request.user_id"` (Session User)。
  - [x] 確保訂閱事件 (Subscription) 同樣受到 RLS 過濾。

## ⚡ 階段三：效能與規模化 (Scale)

- [x] **多租戶支持 (Multi-tenancy)**：
  - [x] 支援單一服務實例監聽多個 Schema。
  - [x] SDK 支援 `collection('table', 'schema')` 指定命名空間。
- [x] **關聯語意 DSL v0.2 規格化**：
  - [x] 支援 `1:1`、`1:N` 伺服器端 JOIN 與 `JSON_AGG` 展開。
  - [x] SDK 實作 `include()` 鏈式語法替代舊有的 `withRelation()`。
  - [x] 支援單次請求中展開多個不同關聯。
  - [x] 教學範例與文件更新完成。
- [ ] **中介層優化**：
  - 引入 Redis 作為事件總線 (Event Bus)，以支援水平擴展的後端節點。

---

_此文件由 TeleNexus 自動維護，每小時進行技術演進評估。_
