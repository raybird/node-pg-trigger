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
exports.runMigrations = runMigrations;
const db_1 = require("../lib/db");
/**
 * 自動化遷移腳本：建立必要的資料表與 Triggers
 */
function runMigrations() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("🚀 Starting database migrations...");
        // 1. 建立審計日誌表 (Audit Log)
        yield db_1.db.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      table_name TEXT NOT NULL,
      action TEXT NOT NULL,
      record JSONB,
      old_record JSONB,
      txid BIGINT DEFAULT txid_current(),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
        // 2. 建立觸發器函式
        yield db_1.db.query(`
    CREATE OR REPLACE FUNCTION notify_db_event() RETURNS TRIGGER AS $$
    DECLARE
      payload JSONB;
    BEGIN
      payload = jsonb_build_object(
        'table', TG_TABLE_NAME,
        'action', LOWER(TG_OP),
        'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE row_to_json(NEW)::jsonb END,
        'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE row_to_json(OLD)::jsonb END,
        'txid', txid_current()
      );
      
      -- 同步寫入審計日誌
      INSERT INTO audit_log (table_name, action, record, old_record, txid)
      VALUES (TG_TABLE_NAME, LOWER(TG_OP), payload->'record', payload->'old_record', (payload->>'txid')::bigint);

      -- 發送 NOTIFY 事件
      PERFORM pg_notify('db_event', payload::text);
      
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);
        console.log("✅ Migrations completed successfully.");
    });
}
