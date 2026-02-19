-- 建立稽核日誌資料表，用於儲存異動歷史以支援斷線重連追補
CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigserial PRIMARY KEY,
  txid bigint NOT NULL,
  timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  action text NOT NULL,
  schema_name text NOT NULL,
  table_name text NOT NULL,
  record jsonb,
  old_record jsonb
);

-- 建立索引以優化追補查詢
CREATE INDEX IF NOT EXISTS idx_audit_log_txid ON public.audit_log(txid);

-- 更新通知函式，使其同時寫入 audit_log
CREATE OR REPLACE FUNCTION public.notify_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  rec JSONB;
  dat JSONB;
  payload TEXT;
  current_txid bigint;
BEGIN
  current_txid := txid_current();

  -- 根據操作類型設定記錄
  CASE TG_OP
    WHEN 'UPDATE' THEN
      rec := to_jsonb(NEW);
      dat := to_jsonb(OLD);
    WHEN 'INSERT' THEN
      rec := to_jsonb(NEW);
      dat := NULL;
    WHEN 'DELETE' THEN
      rec := to_jsonb(OLD);
      dat := NULL;
    ELSE
      RAISE EXCEPTION 'Unknown TG_OP: "%". Should not occur!', TG_OP;
  END CASE;

  -- 1. 寫入 audit_log
  INSERT INTO public.audit_log (txid, action, schema_name, table_name, record, old_record)
  VALUES (current_txid, LOWER(TG_OP), TG_TABLE_SCHEMA, TG_TABLE_NAME, rec, dat);

  -- 2. 建立 JSON payload 並發送通知
  payload := json_build_object(
    'timestamp', CURRENT_TIMESTAMP,
    'txid', current_txid,
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
