"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const ws_1 = require("ws");
const ws_2 = require("@trpc/server/adapters/ws");
const express_2 = require("@trpc/server/adapters/express");
const router_1 = require("./router");
const context_1 = require("./context");
const listener_1 = require("./lib/listener");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// 服務靜態檔案 (教學網站)
app.use(express_1.default.static(path_1.default.join(__dirname, '../../docs')));
const wss = new ws_1.WebSocketServer({ server });
// 建立 tRPC WebSocket handler
const handler = (0, ws_2.applyWSSHandler)({ wss, router: router_1.appRouter, createContext: context_1.createContext });
// 掛載 tRPC Express middleware
app.use('/trpc', (0, express_2.createExpressMiddleware)({
    router: router_1.appRouter,
    createContext: context_1.createContext,
}));
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`✅ Server listening on http://localhost:${PORT}`);
});
// 連接到資料庫並開始監聽
listener_1.dbNotificationListener.connect();
// 處理伺服器關閉
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    handler.broadcastReconnectNotification();
    wss.close();
    server.close();
});
