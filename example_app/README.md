# 範例前後端整合應用程式

這個範例展示了一個基於 Docker 的最小前後端整合應用程式。

## 專案結構

```
example_app/
├── backend/             # 後端 Node.js (Express) 應用程式
│   ├── src/             # 後端原始碼
│   │   └── index.ts
│   ├── Dockerfile       # 後端 Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/            # 純 HTML/JavaScript 前端應用程式
│   ├── index.html
│   └── script.js
└── docker-compose.yml   # Docker Compose 配置檔
```

## 如何運行

請確保您已經安裝了 Docker 和 Docker Compose。

1.  **進入 `example_app` 目錄：**

    ```bash
    cd /home/raybird/Documents/RCodes/pg-trigger-manager/example_app
    ```

2.  **構建並啟動 Docker 容器：**

    運行以下命令來構建後端服務的 Docker 映像，並在後台啟動容器。由於您的本地 3000 埠可能被佔用，此範例已將埠映射更改為 3001。

    ```bash
    docker compose up --build -d
    ```

    *   `docker compose up`: 啟動 `docker-compose.yml` 中定義的服務。
    *   `--build`: 如果映像不存在或 Dockerfile 有更改，則重新構建映像。
    *   `-d`: 在後台運行容器 (detached mode)。

3.  **驗證應用程式：**

    打開您的瀏覽器，訪問 `http://localhost:3001`。您應該會看到一個簡單的網頁，顯示來自後端的訊息 "Hello from backend!"。

## 停止並移除容器 (可選)

當您完成測試後，可以在 `example_app` 目錄中運行以下命令來停止並移除容器：

```bash
docker compose down
```

這將會停止並移除 `docker-compose.yml` 中定義的所有服務的容器和網路。
