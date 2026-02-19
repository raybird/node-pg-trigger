# 建立 Docker 整合範例的計畫

目標是建立一個單一指令 (`docker-compose up`) 就能啟動的完整環境，其中包含資料庫、後端服務以及一個簡單的前端介面來即時顯示資料庫變更。

### 1. 建立一個簡單的前端介面

建立一個 `index.html` 檔案和對應的 TypeScript 客戶端 (`public/client.ts`)。
- **功能**:
    - 使用 `esbuild` 將 `public/client.ts` 打包成瀏覽器可用的 JavaScript。
    - `index.html` 載入打包後的 JS。
    - JS 客戶端使用 `createSdk` 連接到 tRPC 後端，並訂閱資料庫變更通知。
    - 將收到的通知即時顯示在頁面上。

### 2. 建立後端服務的 Dockerfile

為 Node.js/Express 應用程式建立一個 `Dockerfile`，定義如何將應用程式打包成一個獨立的 Docker 映像檔。

### 3. 建立資料庫初始化腳本

建立一個 `init.sql` 檔案，用於在 PostgreSQL 容器首次啟動時自動執行。
- **功能**:
    - 建立 `notify_trigger()` 函式。
    - 建立一個名為 `items` 的範例資料表。
    - 為 `items` 表建立一個觸發器，以便在資料變更時呼叫 `notify_trigger()`。

### 4. 透過 Docker Compose 整合所有服務

建立一個核心的 `docker-compose.yml` 檔案，定義和連結以下三個服務：

1.  **`db`**: PostgreSQL 資料庫服務。
2.  **`backend`**: Node.js 後端服務。
3.  **前端服務**: 修改 Express 伺服器 (`src/server/index.ts`)，使其能夠提供靜態檔案服務 (`index.html` 和打包後的 JS)。

### 專案架構示意圖

```mermaid
graph TD
    subgraph Docker Environment
        A[Browser] -- HTTP/WebSocket --> B{Backend (Node.js/tRPC)}
        B -- Listens for notifications --> C{Database (PostgreSQL)}
    end

    subgraph User Interaction
        D[User] -- 1. Accesses --> A
        D -- 2. Modifies data in DB --> E[pgcli/Database Tool]
    end

    subgraph Data Flow
        E -- 3. Triggers --> C
        C -- 4. NOTIFY 'db_events' --> B
        B -- 5. tRPC Subscription Push --> A
        A -- 6. Displays update --> D
    end

    style B fill:#f9f,stroke:#333,stroke-width:2px
    style C fill:#ccf,stroke:#333,stroke-width:2px
```

### 預計的檔案變更

- **新增檔案**:
    - `docker-compose.yml`
    - `Dockerfile`
    - `init.sql`
    - `public/index.html`
    - `public/client.ts`
    - `.dockerignore`
- **修改檔案**:
    - `package.json`: 加入 `esbuild` 依賴和建置腳本。
    - `src/server/index.ts`: 加入 `express.static`。
    - `.gitignore`: 忽略 `node_modules` 和建置產物。