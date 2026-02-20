# ADR 0085: 統一關聯查詢語法為 include() (Server-side JOIN)

## 狀態
已接受 (Accepted)

## 背景
專案先前在 SDK 層級實作了兩套關聯處理機制：`withRelation()`（客戶端遞迴抓取）與 `include()`（伺服器端 JOIN）。為了降低維護成本、提升效能並對齊 ROADMAP v0.2 的目標，需要將語法統一為伺服器端驅動的 `include()`。

## 決策
1.  **SDK 簡化**：從 `Query` 與 `Document` 類別中移除 `withRelation()` 與 `resolveRelations()`。
2.  **效能優化**：所有關聯資料的展開改由伺服器端透過 `LEFT JOIN LATERAL` 與 `JSON_AGG` 處理，減少網路來回次數。
3.  **語法對齊**：統一使用 `query.include(name, config)` 語法。
4.  **訂閱支援**：確保 `onSnapshot` 初始抓取時正確傳遞 `include` 參數。

## 後果
- **優點**：大幅提昇讀取效能，減少前端代碼複雜度，且能完整利用 PostgreSQL 的關聯運算能力。
- **缺點**：伺服器端 JOIN 在極大數據量下需注意索引優化（已在後端實作基礎過濾）。
