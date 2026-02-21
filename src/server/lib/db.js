"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const pg_1 = require("pg");
// 從環境變數中讀取資料庫連線設定
const pool = new pg_1.Pool({
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    port: process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT, 10) : 5432,
});
exports.db = {
    /**
     * 一般查詢
     */
    query: (text, params) => pool.query(text, params),
    /**
     * 具備使用者 Context 的查詢 (用於 RLS)
     */
    withUser: (userId) => __awaiter(void 0, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            yield client.query('BEGIN');
            // 設定 PG Session 變數，供 RLS Policy 使用
            // 使用 "request.user_id" 作為約定名稱
            yield client.query(`SET LOCAL "request.user_id" = $1`, [userId]);
            return {
                query: (text, params) => client.query(text, params),
                commit: () => client.query('COMMIT'),
                rollback: () => client.query('ROLLBACK'),
                release: () => client.release(),
            };
        }
        catch (err) {
            client.release();
            throw err;
        }
    }),
    /**
     * 檢查特定記錄是否符合使用者的 RLS 權限
     */
    checkRls: (userId_1, tableName_1, record_1, ...args_1) => __awaiter(void 0, [userId_1, tableName_1, record_1, ...args_1], void 0, function* (userId, tableName, record, idField = 'id') {
        var _a;
        const client = yield pool.connect();
        try {
            yield client.query('BEGIN');
            yield client.query(`SET LOCAL "request.user_id" = $1`, [userId]);
            // 這裡我們透過查詢該 ID 是否存在來測試 RLS
            // 如果 RLS policy 過濾掉，則會回傳 0 筆
            const idValue = record[idField];
            if (idValue === undefined)
                return true; // 無法檢查則預設通過 (或可改為嚴格模式)
            const sql = `SELECT 1 FROM "${tableName}" WHERE "${idField}" = $1 LIMIT 1;`;
            const result = yield client.query(sql, [idValue]);
            yield client.query('COMMIT');
            return ((_a = result.rowCount) !== null && _a !== void 0 ? _a : 0) > 0;
        }
        catch (err) {
            yield client.query('ROLLBACK');
            console.error('[RLS Check Error]', err);
            return false;
        }
        finally {
            client.release();
        }
    })
};
