import { randomUUID } from 'crypto';
import express from 'express';
import http from "http";
import WebSocket from 'ws';


const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws: WebSocket) => {
  ws.send(randomUUID());

  ws.on("message", (message: any) => {
    ws.send(message);
  });
});

app.get("/", (req, res) => {
  res.json({ response: randomUUID() });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`PORT Listen At ${PORT}`);
});