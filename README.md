# PG Trigger Manager - 即時資料庫事件廣播系統

`pg-trigger-manager` 是一個基於 Node.js、PostgreSQL 和 tRPC 的高效能即時資料庫事件廣播系統。它能監聽資料庫中資料表的變更（INSERT, UPDATE, DELETE），並透過 WebSocket 將這些事件即時、安全地推送給前端應用。

## ✨ 核心功能

- **🚀 即時事件廣播**: 使用 PostgreSQL 原生的 `LISTEN`/`NOTIFY` 機制，結合 tRPC Subscriptions，實現低延遲的事件推送。
- **🔒 端到端型別安全**: 整個 API 層由 tRPC 構建，從後端到前端 SDK，享受完整的靜態型別檢查和自動完成，大幅減少執行時錯誤。
- **🎛️ 動態觸發器管理**: 提供簡單易用的 tRPC API，讓您可以透過程式碼動態地為任何資料表建立、查詢和刪除事件通知觸發器。
- **📦 前端 SDK**: 提供一個具備 Firestore 風格的 tRPC Client SDK，讓前端應用可以輕鬆整合。

## 📚 文件快速入口

- SDK 即時訂閱/查詢 API 速查：`docs/firestore-realtime-cheatsheet.md`
- 進階查詢運算子：`docs/firestore-query-operators.md`
- `set(..., { merge: true })` 語意：`docs/firestore-set-merge.md`
- 文件站安裝配置：`docs/docs/installation.html`
- 文件站 SDK 教學：`docs/docs/sdk-usage.html`

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

若您偏好「先看 API 再回頭看範例」，可先閱讀速查文件 `docs/firestore-realtime-cheatsheet.md`。

**範例：訂閱資料表 (Collection) - 自動維護快取**

`onSnapshot` 會首先發出一個 `action: 'initial'` 事件，包含目前的完整資料，隨後每次資料庫變更時，SDK 都會自動更新本地快取，並將 **最新的完整資料集** 傳送給回呼函式。

若您只想拿資料本身（不需要 `action/txid` 中繼資訊），可改用 `valueChanges`；若偏好 Rx/訂閱語意命名，也可用 `subscribe`（等價於 `onSnapshot`）。

```typescript
import { createSdk } from "pg-trigger-manager/client";

const sdk = createSdk("http://localhost:5000");

// 'data' 始終是該資料表的最新完整列表
sdk.collection("users").onSnapshot(({ action, record: data }) => {
  console.log(`[${action}] 目前所有使用者:`, data);
  // 直接用 data 來渲染 UI，無需手動合併 insert/update/delete 事件
});

// valueChanges: 只取得資料本體
sdk.collection("users").valueChanges((data) => {
  console.log("目前所有使用者(valueChanges):", data);
});
```

**範例：訂閱特定資料 (Document)**

```typescript
// 獲取並訂閱 ID 為 1 的使用者
sdk.doc("users", 1).onSnapshot(({ action, record: user }) => {
  if (action === "delete") {
    console.log("使用者已刪除");
  } else {
    console.log("使用者最新資料:", user);
  }
});

// subscribe: onSnapshot 的命名別名
sdk.doc("users", 1).subscribe(({ action, record: user }) => {
  console.log("document 變更:", action, user);
});
```

**範例：新增、更新與刪除資料**

```typescript
const users = sdk.collection("users");

// 新增資料
await users.add({ name: "Alice", email: "alice@example.com" });

// 更新單筆資料
const aliceDoc = sdk.doc("users", 1);
await aliceDoc.update({ name: "Alice Smith" });

// 刪除資料
await aliceDoc.delete();
```

**範例：Firestore 風格 `set()`（含 merge）**

```typescript
const userRef = sdk.collection("users").doc("raybird");

// 1) 預設 set: upsert（不存在就建立，存在就以提供欄位覆寫）
await userRef.set({
  name: "Ray Bird",
  role: "editor",
});

// 2) merge 模式: 只更新指定欄位，保留其他欄位
await userRef.set(
  {
    lastSeenAt: FieldValue.serverTimestamp(),
    loginCount: FieldValue.increment(1),
  },
  { merge: true },
);
```

**範例：`withConverter()` 型別與欄位映射**

```typescript
const userConverter = {
  fromFirestore(row) {
    return {
      id: row.id,
      displayName: row.name,
      upperRole: String(row.role || "").toUpperCase(),
    };
  },
  toFirestore(model) {
    return {
      name: model.displayName,
      role: String(model.upperRole || "").toLowerCase(),
    };
  },
};

const users = sdk.collection("users").withConverter(userConverter);
const list = await users.get(); // 已轉為 displayName/upperRole

const ref = users.doc(1);
await ref.update({ displayName: "Ray Bird", upperRole: "EDITOR" });
```

**範例：使用伺服器特殊值 (FieldValue)**

SDK 支援多種伺服器端原子操作，確保資料的一致性與效能。

```typescript
import { FieldValue } from "pg-trigger-manager/client";

// 1. 伺服器時間戳記
await sdk.collection("posts").add({
  title: "Hello Vanilla",
  createdAt: FieldValue.serverTimestamp(),
});

// 2. 原子增量 (Increment) - 適用於點擊數、庫存等
await sdk.doc("products", 123).update({
  viewCount: FieldValue.increment(1),
});

// 3. 陣列操作 (Array Union/Remove) - 自動處理重複元素
await sdk.doc("users", "raybird").update({
  tags: FieldValue.arrayUnion("developer", "ai"),
  roles: FieldValue.arrayRemove("guest"),
});

// 4. 刪除欄位 (Delete)
await sdk.doc("users", "raybird").update({
  temporaryToken: FieldValue.delete(),
});
```

**範例：批量寫入 (Write Batches)**

批量寫入允許您在單一原子性交易中執行多個操作，確保所有異動「全部成功，或全部不執行」。

```typescript
const batch = sdk.batch();

const userRef = sdk.doc("users", "raybird");
const profileRef = sdk.doc("profiles", "raybird");

// 打包多個異動
batch.update(userRef, { lastSeen: FieldValue.serverTimestamp() });
batch.update(profileRef, { points: FieldValue.increment(10) });
batch.set(userRef, { status: "active" }, { merge: true });

// 一次性送出並執行交易
await batch.commit();
```

**範例：讀寫交易 (Transactions)**

交易允許您執行「讀取後寫入」的原子操作。如果資料在讀取與寫入之間被他人修改，交易會自動重試。

```typescript
await sdk.runTransaction(async (transaction) => {
  const userRef = sdk.doc('users', 'raybird');
  
  // 1. 讀取資料 (會自動紀錄版本快照)
  const user = await transaction.get(userRef);
  
  if (!user) throw new Error('User not found');
  
  // 2. 基於讀取到的資料進行運算
  const newPoints = (user.points || 0) + 10;
  
  // 3. 寫入變更 (會自動執行樂觀鎖校驗)
  transaction.update(userRef, { points: newPoints });
});
```

### 可靠性與追補機制

SDK 內建了強大的斷線自癒能力。利用 PostgreSQL 的交易 ID (txid) 與後端的 `audit_log` 機制，當您的應用程式重新連線時，SDK 會自動請求補發所有遺漏的異動事件。

- **自動追補**：斷線重連後，SDK 會自動從最後接收到的事件點開始追補。
- **資料一致性**：確保前端快取與資料庫狀態始終維持高度同步。
- **效能優化**：追補查詢經過索引優化，僅撈取必要的差異數據。

### 進階查詢支援

SDK 支援類似 Firestore 的鏈式查詢語法，讓您可以精準地獲取並監聽符合條件的資料。

**範例：過濾與排序**

```typescript
const query = sdk
  .collection("products")
  .where("price", ">", 100)
  .where("status", "==", "active")
  .orderBy("createdAt", "desc")
  .limit(10);

// onSnapshot 會自動套用上述過濾條件
query.onSnapshot(({ record: data }) => {
  console.log("符合條件的熱門產品:", data);
});
```

**範例：Firestore 風格集合條件 (`in` / `not-in`)**

```typescript
const importantUsers = sdk
  .collection("users")
  .where("role", "in", ["admin", "editor"])
  .where("status", "not-in", ["blocked", "deleted"]);

importantUsers.onSnapshot(({ record: users }) => {
  console.log("可操作後台的使用者:", users);
});

const urgentProjects = sdk
  .collection("projects")
  .where("tags", "array-contains", "urgent");

urgentProjects.onSnapshot(({ record: projects }) => {
  console.log("含 urgent 標籤的專案:", projects);
});

const focusProjects = sdk
  .collection("projects")
  .where("tags", "array-contains-any", ["urgent", "p1", "hotfix"]);

focusProjects.onSnapshot(({ record: projects }) => {
  console.log("命中任一重點標籤的專案:", projects);
});

// Firestore 風格 limitToLast：需搭配 orderBy
const latestImportant = sdk
  .collection("events")
  .orderBy("created_at", "asc")
  .limitToLast(5);

latestImportant.onSnapshot(({ record: rows }) => {
  console.log("最後 5 筆事件:", rows);
});

// 聚合輔助：直接取得目前查詢數量
const activeCount = await sdk
  .collection("users")
  .where("status", "==", "active")
  .count();

console.log("啟用使用者數量:", activeCount);

// 文件存在性檢查
const exists = await sdk.doc("users", 1).exists();
console.log("使用者 #1 是否存在:", exists);

// Cursor 分頁：需先 orderBy
const pageQuery = sdk
  .collection("events")
  .orderBy("created_at", "asc")
  .startAfter("2026-02-20T00:00:00.000Z")
  .endAt("2026-02-20T23:59:59.999Z")
  .limit(20);

const pageRows = await pageQuery.get();
console.log("今日事件窗口:", pageRows.length);
```

- **支援運算子**：`==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `in`, `not-in`, `array-contains`, `array-contains-any`。
- **分頁語法**：`limit(n)`、`offset(n)`、`limitToLast(n)`（需搭配 `orderBy`）。
- **游標語法**：`startAt(v)`、`startAfter(v)`、`endAt(v)`、`endBefore(v)`（需搭配 `orderBy`）。
- **模型映射**：支援 `withConverter()`，可集中處理欄位映射與型別轉換。
- **聚合與存在性輔助**：支援 `query.count()` 與 `doc.exists()`。
- **即時過濾**：當資料庫發生異動時，SDK 會在客戶端自動判斷該變更是否符合您的查詢條件，並動態更新結果集。
