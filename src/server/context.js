"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContext = void 0;
/**
 * 定義 tRPC context。
 */
const createContext = ({ req, res }) => {
    let user = null;
    // 1. 從 HTTP Headers 提取 (用於 Query/Mutation)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const userId = authHeader.split(' ')[1];
        if (userId) {
            user = { id: userId };
        }
    }
    // 2. 從 WebSocket URL Query 提取 (用於 Subscription)
    // 格式: ws://localhost:5000/trpc?token=user_123
    if (!user && req.url) {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const token = url.searchParams.get('token');
        if (token) {
            user = { id: token };
        }
    }
    return {
        user,
    };
};
exports.createContext = createContext;
