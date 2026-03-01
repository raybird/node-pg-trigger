import createSubscriber from 'pg-listen';
import { db } from './db';
import { eventBus } from './event-bus';

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
  private subscriber: ReturnType<typeof createSubscriber>;
  private reconnectInterval = 5000; // 基礎重連間隔 (5秒)
  private maxReconnectInterval = 60000; // 最大重連間隔 (1分鐘)

  constructor() {
    const databaseURL = `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB}`;
    
    this.subscriber = createSubscriber({ connectionString: databaseURL });

    this.subscriber.notifications.on('db_events', (payload) => {
      const startTime = performance.now();
      // v1.4.0 效能優化：pg-listen 已自動解析 JSON
      // 這裡僅進行結構校驗與分發
      if (!payload || !payload.table || !payload.action) {
        console.warn('[PG-Trigger] Received invalid payload, skipping.');
        return;
      }

      eventBus.publish(payload);
      
      const duration = performance.now() - startTime;
      if (duration > 50) { // 耗時超過 50ms 則記錄警告
        console.warn(`[PG-Trigger] Slow payload processing: ${duration.toFixed(2)}ms for table ${payload.table}`);
      }
    });

    this.subscriber.events.on('error', (error) => {
      console.error('[PG-Trigger] Database connection error:', error.message);
      // v1.1.0 Fix: 不再直接結束進程，等待 pg-listen 內建的重連邏輯或手動觸發
    });

    this.subscriber.events.on('reconnect', (attempt) => {
      console.warn(`[PG-Trigger] Attempting to reconnect (Attempt ${attempt})...`);
    });

    this.subscriber.events.on('connected', () => {
      console.log('[PG-Trigger] Connected/Reconnected to database.');
    });
  }

  /**
   * 初始化資料庫基礎設施 (函式與觸發器)
   */
  private async initInfrastructure() {
    console.log('🔧 Initializing database infrastructure...');
    try {
      await db.query(NOTIFY_FUNCTION_SQL);
      console.log('✅ Global notify_trigger() function is ready.');

      const watchTables = process.env.WATCH_TABLES;
      if (watchTables) {
        const tables = watchTables.split(',').map(t => t.trim());
        for (const table of tables) {
          if (!table) continue;
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
          await db.query(sql);
          console.log(`📡 Auto-watching table: ${table}`);
        }
      }
    } catch (e) {
      console.error('❌ Failed to initialize infrastructure:', e.message);
      // 基礎設施初始化失敗則等待後重試
      setTimeout(() => this.initInfrastructure(), this.reconnectInterval);
    }
  }

  public async connect() {
    // 1. 先初始化基礎設施
    await this.initInfrastructure();
    
    // 2. 開始監聽 (pg-listen 內建重連)
    try {
      await this.subscriber.connect();
      await this.subscriber.listenTo('db_events');
      console.log('🚀 Listening for notifications on "db_events" channel...');
    } catch (e) {
      console.error('❌ Connection failed, will retry automatically.');
    }
  }
}

export const dbNotificationListener = new NotificationListener();
