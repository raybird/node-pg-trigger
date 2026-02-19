"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const trpcExpress = __importStar(require("@trpc/server/adapters/express"));
const router_1 = require("./router");
const context_1 = require("./context");
const cors_1 = __importDefault(require("cors"));
const ws_1 = require("@trpc/server/adapters/ws");
const ws_2 = require("ws");
const app = (0, express_1.default)();
const port = process.env.PORT || 5000;
app.use((0, cors_1.default)());
app.use('/trpc', trpcExpress.createExpressMiddleware({
    router: router_1.appRouter,
    createContext: context_1.createContext,
}));
const server = app.listen(port, () => {
    console.log(`Backend listening at http://localhost:${port}`);
    // Create a WebSocket server
    const wss = new ws_2.WebSocketServer({ server });
    const handler = (0, ws_1.applyWSSHandler)({
        wss,
        router: router_1.appRouter,
        createContext: context_1.createContext,
    });
    wss.on('connection', (ws) => {
        console.log(`➕➕ Connection (${wss.clients.size})`);
        ws.once('close', () => {
            console.log(`➖➖ Connection (${wss.clients.size})`);
        });
    });
    console.log('✅ WebSocket Server listening');
    process.on('SIGTERM', () => {
        console.log('SIGTERM');
        wss.close();
    });
});
