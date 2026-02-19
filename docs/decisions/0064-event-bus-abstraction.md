# ADR 0064: 事件總線抽象化 (Event Bus Abstraction)

## 狀態
已接受 (Accepted)

## 背景
`node-pg-trigger` 目前的設計中，tRPC 訂閱直接向 PostgreSQL 監聽器 (`NotificationListener`) 註冊事件。這種強耦合的模式雖然在單機環境下可行，但存在以下限制：
1. **難以擴展**：若未來有多個伺服器節點，PostgreSQL 的 `NOTIFY` 僅會被連線的該節點接收，其他節點的客戶端無法收到通知。
2. **職責不清**：監聽器同時負責「資料庫通訊」與「應用程式內事件分發」。

## 決策
引入一個中間層 `EventBus` 來解耦事件的來源與去向。
1. **發布/訂閱模式**：`NotificationListener` 收到 PG 通知後，僅負責呼叫 `eventBus.publish()`。
2. **抽象介面**：上層業務（如 tRPC Subscriptions）統一向 `eventBus.subscribe()` 註冊。
3. **未來擴展性**：目前的 `EventBus` 是基於 Node.js 內建的 `EventEmitter` 實作。未來若需支援水平擴展，僅需將 `EventBus` 的實作換成 Redis Pub/Sub，而無需修改任何業務邏輯。

## 後果
- **優點**：架構更加清晰、易於測試、具備工業級的可擴展性。
- **缺點**：增加了一個微小的記憶體中轉開銷（在單機模式下可忽略不計）。
