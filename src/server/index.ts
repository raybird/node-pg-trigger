import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer } from 'ws';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { appRouter } from './router';
import { createContext } from './context';
import { dbNotificationListener } from './lib/listener';

const app = express();
const server = http.createServer(app);

// 服務靜態檔案 (教學網站)
app.use(express.static(path.join(__dirname, '../../public')));

const wss = new WebSocketServer({ server });

// 建立 tRPC WebSocket handler
const handler = applyWSSHandler({ wss, router: appRouter, createContext });

// 掛載 tRPC Express middleware
app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`✅ Server listening on http://localhost:${PORT}`);
});

// 連接到資料庫並開始監聽
dbNotificationListener.connect();

// 處理伺服器關閉
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  handler.broadcastReconnectNotification();
  wss.close();
  server.close();
});