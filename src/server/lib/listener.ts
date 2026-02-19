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

  constructor() {
    const databaseURL = `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB}`;
    
    this.subscriber = createSubscriber({ connectionString: databaseURL });

    this.subscriber.notifications.on('db_events', (payload) => {
      console.log('Received notification on db_events:', payload);
      // 將事件分發至全域 EventBus
      eventBus.publish(payload);
    });

    this.subscriber.events.on('error', (error) => {
      console.error('Fatal database connection error:', error);
      process.exit(1);
    });
  }

  /**
   * 初始化資料庫基礎設施 (函式與觸發器)
   */
  private async initInfrastructure() {
    console.log('🔧 Initializing database infrastructure...');
    
    // 1. 確保 notify_trigger 函式存在
    await db.query(NOTIFY_FUNCTION_SQL);
    console.log('✅ Global notify_trigger() function is ready.');

    // 2. 檢查環境變數並自動建立觸發器
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
  }

  public async connect() {
    // 先初始化基礎設施
    await this.initInfrastructure();
    
    // 再開始監聽
    await this.subscriber.connect();
    await this.subscriber.listenTo('db_events');
    console.log('🚀 Listening for notifications on "db_events" channel...');
  }
}

export const dbNotificationListener = new NotificationListener();
