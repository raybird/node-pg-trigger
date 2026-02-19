"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const ws_1 = __importDefault(require("ws"));
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const wss = new ws_1.default.Server({ server });
wss.on("connection", (ws) => {
    ws.send((0, crypto_1.randomUUID)());
    ws.on("message", (message) => {
        ws.send(message);
    });
});
app.get("/", (req, res) => {
    res.json({ response: (0, crypto_1.randomUUID)() });
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`PORT Listen At ${PORT}`);
});
