/**
 * Node-PG-Trigger 核心型別定義 (v1.2.0)
 */

export type DBAction = 'insert' | 'update' | 'delete';

export interface TriggerPayload<T = any> {
  timestamp: string;
  txid: string;
  action: DBAction;
  schema: string;
  table: string;
  record: T;
  old_record: T | null;
}

export interface EventBusOptions {
  maxListeners?: number;
}
