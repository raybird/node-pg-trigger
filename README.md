# PG Trigger Manager - 即時資料庫事件廣播系統

`pg-trigger-manager` 是一個基於 Node.js、PostgreSQL 和 tRPC 的高效能即時資料庫事件廣播系統。它能監聽資料庫中資料表的變更（INSERT, UPDATE, DELETE），並透過 WebSocket 將這些事件即時、安全地推送給前端應用。

## ✨ 核心功能

*   **🚀 即時事件廣播**: 使用 PostgreSQL 原生的 `LISTEN`/`NOTIFY` 機制，結合 tRPC Subscriptions，實現低延遲的事件推送。
*   **🔒 端到端型別安全**: 整個 API 層由 tRPC 構建，從後端到前端 SDK，享受完整的靜態型別檢查和自動完成，大幅減少執行時錯誤。
*   **🎛️ 動態觸發器管理**: 提供簡單易用的 tRPC API，讓您可以透過程式碼動態地為任何資料表建立、查詢和刪除事件通知觸發器。
*   **📦 前端 SDK**: 提供一個具備 Firestore 風格的 tRPC Client SDK，讓前端應用可以輕鬆整合。

## 🚀 快速開始

### 1. 環境設定

首先，複製這個專案庫並安裝依賴套件：

```bash
git clone <repository-url>
cd pg-trigger-manager
npm install
```

### 2. 設定環境變數

複製 `.env.sample` 檔案來建立您的 `.env` 設定檔：

```bash
cp .env.sample .env
```

接著，編輯 `.env` 檔案，填寫您的 PostgreSQL 資料庫連線資訊。

```env
POSTGRES_HOST=localhost
POSTGRES_DB=your_database
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password
POSTGRES_PORT=5432
WATCH_TABLES=users,posts  # 在啟動時自動建立觸發器的資料表
```

### 3. 設定資料庫

為了讓系統能夠運作，您需要在您的 PostgreSQL 資料庫中執行一次 `notify_trigger.sql` 檔案。這個腳本會建立一個通用的觸發器函式 `public.notify_trigger()`。

您可以使用任何 PostgreSQL 客戶端工具（如 `psql` 或 DBeaver）來執行這個 SQL 檔案的內容。

### 4. 啟動伺服器

完成以上設定後，執行以下指令來啟動後端伺服器：

```bash
npm start
```

伺服器預設會在 `http://localhost:5000` 啟動。

## 🛠️ 使用方式

### 前端 SDK (Firestore 風格)

我們提供了一個與 Firestore 語法高度一致的 SDK，讓您可以輕鬆地訂閱資料表或特定資料列的變動。

**範例：訂閱資料表 (Collection) - 自動維護快取**

`onSnapshot` 會首先發出一個 `action: 'initial'` 事件，包含目前的完整資料，隨後每次資料庫變更時，SDK 都會自動更新本地快取，並將 **最新的完整資料集** 傳送給回呼函式。

```typescript
import { createSdk } from 'pg-trigger-manager/client';

const sdk = createSdk('http://localhost:5000');

// 'data' 始終是該資料表的最新完整列表
sdk.collection('users').onSnapshot(({ action, record: data }) => {
  console.log(`[${action}] 目前所有使用者:`, data);
  // 直接用 data 來渲染 UI，無需手動合併 insert/update/delete 事件
});
```

**範例：訂閱特定資料 (Document)**

```typescript
// 獲取並訂閱 ID 為 1 的使用者
sdk.doc('users', 1).onSnapshot(({ action, record: user }) => {
  if (action === 'delete') {
    console.log('使用者已刪除');
  } else {
    console.log('使用者最新資料:', user);
  }
});
```

**範例：新增與更新資料**

```typescript
const users = sdk.collection('users');

// 新增資料
await users.add({ name: 'Alice', email: 'alice@example.com' });

// 更新單筆資料
const aliceDoc = sdk.doc('users', 1);
await aliceDoc.update({ name: 'Alice Smith' });

// 刪除資料
await aliceDoc.delete();
```

### 身分驗證與安全性 (RLS)

SDK 支援模擬使用者身分驗證，並會自動將使用者 ID 傳遞給 PostgreSQL，讓您可以利用 **Row-Level Security (RLS)** 實作精密的資料權限控管。

**範例：設定使用者身分**

```typescript
// 以使用者 ID 'user_123' 登入
sdk.auth('user_123');

// 隨後的請求都會帶上身分，PG 中可透過 current_setting('request.user_id') 獲取
const myPrivateData = await sdk.collection('private_notes').onSnapshot(...);

// 登出
sdk.signOut();
```

**資料庫端設定 (RLS 範例)**：

```sql
-- 在 PG 中啟用 RLS
ALTER TABLE private_notes ENABLE ROW LEVEL SECURITY;

-- 建立策略：僅允許擁有者讀取
CREATE POLICY notes_access_policy ON private_notes
FOR SELECT
USING (owner_id = current_setting('request.user_id'));
```
