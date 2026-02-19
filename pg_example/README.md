# PG Trigger Manager 範例應用程式

這個範例展示了 `pg-trigger-manager` 專案的核心功能，包括 PostgreSQL 資料庫事件的即時廣播、後端 tRPC API 以及一個簡單的前端介面。

## 專案結構

```
pg_example/
├── backend/             # pg-trigger-manager 後端服務
│   ├── src/             # 後端原始碼
│   │   ├── context.ts
│   │   ├── index.ts
│   │   ├── router.ts
│   │   ├── trpc.ts
│   │   ├── lib/db.ts
│   │   ├── lib/listener.ts
│   │   └── procedures/trigger.ts
│   ├── Dockerfile       # 後端 Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── db/                  # 資料庫初始化腳本
│   └── notify_trigger.sql
├── frontend/            # 簡單的前端應用 (HTML/JS)
│   ├── index.html
│   └── script.js
├── nginx.conf           # Nginx 配置檔，用於服務前端靜態檔案
└── docker-compose.yml   # Docker Compose 配置檔，用於編排所有服務
```

## 如何運行

請確保您已經安裝了 Docker 和 Docker Compose。

1.  **進入 `pg_example` 目錄：**

    ```bash
    cd /home/raybird/Documents/RCodes/pg-trigger-manager/pg_example
    ```

2.  **構建並啟動 Docker 容器：**

    運行以下命令來構建所有服務的 Docker 映像，並在後台啟動容器。這將啟動 PostgreSQL 資料庫、`pg-trigger-manager` 後端和 Nginx 前端服務。

    ```bash
    docker compose up --build -d
    ```

    *   `docker compose up`: 啟動 `docker-compose.yml` 中定義的服務。
    *   `--build`: 如果映像不存在或 Dockerfile 有更改，則重新構建映像。
    *   `-d`: 在後台運行容器 (detached mode)。

## 如何互動

1.  **訪問前端應用程式：**

    打開您的瀏覽器，訪問 `http://localhost:8080`。您應該會看到一個簡單的網頁，包含「觸發器管理」和「資料庫事件」兩個區塊。

2.  **透過前端管理觸發器：**

    *   在「資料表名稱」輸入框中輸入一個資料表名稱 (例如：`users`)。
    *   點擊「建立觸發器」按鈕。您應該會在「資料庫事件」區塊看到建立成功的訊息。
    *   點擊「列出觸發器」按鈕，應該會顯示您剛才建立的觸發器。
    *   點擊「刪除觸發器」按鈕，可以刪除該資料表的觸發器。

3.  **觸發資料庫事件並觀察前端：**

    為了看到「資料庫事件」區塊顯示即時事件，您需要對 PostgreSQL 資料庫進行操作。請確保您已經透過前端為您想操作的資料表建立了觸發器 (例如 `users` 表)。

    *   **連接到 PostgreSQL 資料庫：**

        您可以使用任何 PostgreSQL 客戶端工具 (例如 `psql` 或 DBeaver) 連接到 `localhost:5432`，使用者名稱為 `user`，密碼為 `password`，資料庫為 `mydatabase`。

        或者，您也可以透過 Docker 進入 `db` 容器的 shell：

        ```bash
        docker exec -it pg_example-db-1 psql -U user -d mydatabase
        ```

    *   **建立一個測試表 (如果沒有的話)：**

        ```sql
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255),
            email VARCHAR(255)
        );
        ```

    *   **插入、更新或刪除資料：**

        在 `psql` 或您的客戶端中執行以下 SQL 語句，然後觀察前端頁面上的「資料庫事件」區塊：

        **插入資料：**
        ```sql
        INSERT INTO users (name, email) VALUES ('John Doe', 'john@example.com');
        ```

        **更新資料：**
        ```sql
        UPDATE users SET name = 'Jane Doe' WHERE id = 1;
        ```

        **刪除資料：**
        ```sql
        DELETE FROM users WHERE id = 1;
        ```
        每次執行這些操作後，您應該會在前端頁面上看到對應的資料庫事件通知。

## 停止並移除容器 (可選)

當您完成測試後，可以在 `pg_example` 目錄中運行以下命令來停止並移除所有相關的容器和網路：

```bash
docker compose down
```
