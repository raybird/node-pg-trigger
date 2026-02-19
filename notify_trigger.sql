-- 建立一個通用的通知函式，用於被觸發器呼叫
CREATE OR REPLACE FUNCTION public.notify_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  rec JSON;
  dat JSON;
  payload TEXT;
BEGIN
  -- 根據操作類型設定記錄
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

  -- 建立 JSON payload
  payload := json_build_object(
    'timestamp', CURRENT_TIMESTAMP,
    'txid', txid_current(),
    'action', LOWER(TG_OP),
    'schema', TG_TABLE_SCHEMA,
    'table', TG_TABLE_NAME,
    'record', rec,
    'old_record', dat
  );

  -- 使用 'db_events' 作為固定 channel 名稱，並發送通知
  PERFORM pg_notify('db_events', payload);

  -- 返回值在 AFTER trigger 中會被忽略，但函式需要它
  -- 對於 INSERT 或 UPDATE，返回 NEW；對於 DELETE，返回 OLD
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;

-- 註解：如何使用此函式
/*
-- 1. 先在你的資料庫中執行一次上面的 SQL 來建立 notify_trigger() 函式。

-- 2. 接著，為你想要監聽的資料表建立一個觸發器，將它掛載到這個函式上。
--    例如，為 "users" 資料表建立觸發器：
CREATE TRIGGER users_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.users
FOR EACH ROW EXECUTE PROCEDURE public.notify_trigger();

-- 3. 現在，任何對 "users" 表的 CUD 操作都會觸發通知。
*/