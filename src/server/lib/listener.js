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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbNotificationListener = void 0;
const pg_listen_1 = __importDefault(require("pg-listen"));
const db_1 = require("./db");
const event_bus_1 = require("./event-bus");
const NOTIFY_FUNCTION_SQL = `
CREATE OR REPLACE FUNCTION public.notify_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  rec JSON;
  dat JSON;
  payload TEXT;
BEGIN
  CASE TG_OP
    WHEN 'UPDATE' THEN
      rec := row_to_json(NEW);
      dat := row_to_json(OLD);
    WHEN 'INSERT' THEN
      rec := row_to_json(NEW);
      dat := NULL;
    WHEN 'DELETE' THEN
      rec := row_to_json(OLD);
      dat := NULL;
    ELSE
      RAISE EXCEPTION 'Unknown TG_OP: "%". Should not occur!', TG_OP;
  END CASE;

  payload := json_build_object(
    'timestamp', CURRENT_TIMESTAMP,
    'txid', txid_current(),
    'action', LOWER(TG_OP),
    'schema', TG_TABLE_SCHEMA,
    'table', TG_TABLE_NAME,
    'record', rec,
    'old_record', dat
  );

  PERFORM pg_notify('db_events', payload);

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;
`;
class NotificationListener {
    constructor() {
        const databaseURL = `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB}`;
        this.subscriber = (0, pg_listen_1.default)({ connectionString: databaseURL });
        this.subscriber.notifications.on('db_events', (payload) => {
            console.log('Received notification on db_events:', payload);
            // 將事件分發至全域 EventBus
            event_bus_1.eventBus.publish(payload);
        });
        this.subscriber.events.on('error', (error) => {
            console.error('Fatal database connection error:', error);
            process.exit(1);
        });
    }
    /**
     * 初始化資料庫基礎設施 (函式與觸發器)
     */
    initInfrastructure() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('🔧 Initializing database infrastructure...');
            // 1. 確保 notify_trigger 函式存在
            yield db_1.db.query(NOTIFY_FUNCTION_SQL);
            console.log('✅ Global notify_trigger() function is ready.');
            // 2. 檢查環境變數並自動建立觸發器
            const watchTables = process.env.WATCH_TABLES;
            if (watchTables) {
                const tables = watchTables.split(',').map(t => t.trim());
                for (const table of tables) {
                    if (!table)
                        continue;
                    const triggerName = `t_notify_${table}`;
                    const sql = `
          DO $$
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = '${triggerName}') THEN
              CREATE TRIGGER ${triggerName}
              AFTER INSERT OR UPDATE OR DELETE ON "${table}"
              FOR EACH ROW EXECUTE PROCEDURE public.notify_trigger();
            END IF;
          END $$;
        `;
                    yield db_1.db.query(sql);
                    console.log(`📡 Auto-watching table: ${table}`);
                }
            }
        });
    }
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            // 先初始化基礎設施
            yield this.initInfrastructure();
            // 再開始監聽
            yield this.subscriber.connect();
            yield this.subscriber.listenTo('db_events');
            console.log('🚀 Listening for notifications on "db_events" channel...');
        });
    }
}
exports.dbNotificationListener = new NotificationListener();
