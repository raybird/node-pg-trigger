# 📋 任務清單：Firestore-like `limitToLast` 查詢體驗

## 🎯 目標

補齊 Firestore-like 查詢窗口能力，導入 `limitToLast(n)` 並讓即時快照在排序與窗口裁切下維持穩定結果，降低從 Firestore 遷移時的查詢語意落差。

## 🛠 任務分解

- [x] **Phase 1: Query API 擴充**
  - [x] 新增 `Query.limitToLast(n)` 鏈式語法。
  - [x] 新增必要防呆：`limitToLast` 需搭配 `orderBy`。
- [x] **Phase 2: 快照窗口一致性**
  - [x] 初始查詢支援反向排序抓取後回正，對齊 Firestore `limitToLast` 語意。
  - [x] 即時事件更新後，套用客戶端排序與窗口裁切，維持結果穩定。
- [x] **Phase 3: 測試與文件同步**
  - [x] 新增查詢行為測試（`get` / `onSnapshot` / 防呆錯誤）。
  - [x] 更新 `README.md` 與 `ROADMAP.md` 使用說明。
- [x] **Phase 4: 編譯輸出同步**
  - [x] 同步更新 `src/client/index.js`，與 TypeScript 來源一致。
