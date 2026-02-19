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
- [x] **自動快取與補丁 (Client-side Caching)**：
    - [x] 前端自動獲取初始快照 (Initial Snapshot Fetching)。
    - [x] 接收到變更事件時自動維護 Local State 並回傳完整快照。
- [x] **CRUD 操作支援**：
    - [x] `collection.add(data)` 實作。
    - [x] `doc.update(data)` 實作。
    - [x] `doc.delete()` 實作。

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
- [ ] **中介層優化**：
    - 引入 Redis 作為事件總線 (Event Bus)，以支援水平擴展的後端節點。

---
*此文件由 TeleNexus 自動維護，每小時進行技術演進評估。*
