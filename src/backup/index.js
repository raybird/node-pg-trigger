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
const ts_postgres_1 = require("ts-postgres");
const pg_listen_1 = __importDefault(require("pg-listen"));
const config = {
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
};
const databaseURL = `postgres://${config.user}:${config.password}@${config.host}:5432/${config.database}`;
const subscriber = (0, pg_listen_1.default)({ connectionString: databaseURL });
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const eventName = "db_event";
        yield subscriber.connect();
        yield subscriber.listenTo(eventName);
        subscriber.notifications.on(eventName, (data) => __awaiter(this, void 0, void 0, function* () {
            console.log(data);
        }));
        console.log('config :>> ', config);
        // 建立 PostgreSQL 客戶端
        const client = new ts_postgres_1.Client(config);
        yield client.connect();
        try {
            // 建立資料表
            //   const createQuery = new Query(`
            //   CREATE TABLE users (
            //     id SERIAL PRIMARY KEY,
            //     name VARCHAR(255) NOT NULL,
            //     email VARCHAR(255) NOT NULL
            //   );
            // `);
            //   const result = await client.execute(createQuery);
            // 建立觸發器
            const createTriggerFunction = (table, event) => {
                return [`
      CREATE OR REPLACE FUNCTION notify_trigger() RETURNS trigger AS $trigger$
      DECLARE
        rec ${table};
        dat ${table};
        payload TEXT;
      BEGIN

        -- Set record row depending on operation
        CASE TG_OP
        WHEN 'UPDATE' THEN
          rec := NEW;
          dat := OLD;
        WHEN 'INSERT' THEN
          rec := NEW;
        WHEN 'DELETE' THEN
          rec := OLD;
        ELSE
          RAISE EXCEPTION 'Unknown TG_OP: "%". Should not occur!', TG_OP;
        END CASE;

        -- Build the payload
        payload := json_build_object('timestamp',CURRENT_TIMESTAMP,'action',LOWER(TG_OP),'db_schema',TG_TABLE_SCHEMA,'table',TG_TABLE_NAME,'record',row_to_json(rec), 'old',row_to_json(dat));

        -- Notify the channel
        PERFORM pg_notify('${eventName}', payload);

        RETURN rec;
      END;
      $trigger$ LANGUAGE plpgsql;`,
                    `
      CREATE OR REPLACE TRIGGER ${table}_notify
      AFTER INSERT OR UPDATE OR DELETE
      ON ${table}
      FOR EACH ROW EXECUTE PROCEDURE notify_trigger();`
                ];
            };
            // 建立觸發器
            const [fnQuery, triQuery] = createTriggerFunction("users", "INSERT");
            // console.log('fnQuery :>> ', fnQuery);
            // console.log('triQuery :>> ', triQuery);
            // await client.query(fnQuery);
            // await client.query(triQuery);
            // await client.query(createTriggerFunction("users", "delete", (row: string) => {
            //   console.log("User deleted: " + row);
            // }));
            // 接收事件
            // const listener = (notify: Notification) => {
            //   console.log('notify :>> ', notify);
            //   console.log("Received event: " + notify.channel + ", payload: " + notify.payload);
            // };
            // client.on('notification', listener);
            // 插入一個使用者
            yield client.query(`
    INSERT INTO users (name, email) VALUES ('John Doe', 'johndoe@example.com');
  `);
            // 更新使用者的姓名
            yield client.query(`
    UPDATE users SET name = 'Jane Doe' WHERE id = 1;
  `);
            // 刪除使用者
            //   await client.query(`
            //   DELETE FROM users WHERE id = 1;
            // `);
        }
        catch (error) {
            console.log('error :>> ', error);
        }
        finally {
            yield subscriber.unlistenAll();
            yield subscriber.close();
            yield client.end();
        }
        // 關閉 PostgreSQL 連線池
        // await pool.end();
    });
}
main();
function listTrigger() {
    return `SELECT  event_object_table AS table_name ,trigger_name         
  FROM information_schema.triggers  
  GROUP BY table_name , trigger_name 
  ORDER BY table_name ,trigger_name`;
}
function dropTrigger(table, trigger) {
    return `
  DROP TRIGGER IF EXISTS ${trigger} 
  ON ${table}`;
}
