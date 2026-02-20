import {
  createTRPCProxyClient,
  httpBatchLink,
  wsLink,
  splitLink,
} from "@trpc/client";
import { createWSClient } from "@trpc/client";
import type { AppRouter } from "../server/router";

export type DbEvent<T = any> = {
  timestamp: string;
  txid: number;
  action: "insert" | "update" | "delete" | "initial";
  schema: string;
  table: string;
  record: T | T[];
  old_record: T | null;
};

export type FilterOperator =
  | "=="
  | ">"
  | "<"
  | ">="
  | "<="
  | "!="
  | "contains"
  | "array-contains"
  | "array-contains-any"
  | "in"
  | "not-in";

export interface Filter {
  field: string;
  operator: FilterOperator;
  value: any;
}

export interface SortItem {
  field: string;
  direction: "asc" | "desc";
}

export interface SetOptions {
  merge?: boolean;
}

/**
 * FieldValue - 支援特殊伺服器端值的處理
 */
export class FieldValue {
  private constructor(
    public readonly type:
      | "SERVER_TIMESTAMP"
      | "INCREMENT"
      | "DELETE_FIELD"
      | "ARRAY_UNION"
      | "ARRAY_REMOVE",
    public readonly value?: any,
  ) {}

  static serverTimestamp() {
    return new FieldValue("SERVER_TIMESTAMP");
  }

  static increment(n: number) {
    return new FieldValue("INCREMENT", n);
  }

  static delete() {
    return new FieldValue("DELETE_FIELD");
  }

  static arrayUnion(...elements: any[]) {
    return new FieldValue("ARRAY_UNION", elements);
  }

  static arrayRemove(...elements: any[]) {
    return new FieldValue("ARRAY_REMOVE", elements);
  }

  static isFieldValue(val: any): val is FieldValue {
    return val && val._isFieldValue === true;
  }

  // 為了跨環境傳輸時保持型別資訊
  get _isFieldValue() {
    return true;
  }
}

/**
 * Query 類別 - 支援過濾、排序與分頁
 */
export class Query<T = any> {
  protected filters: Filter[] = [];
  protected sortItems: SortItem[] = [];
  protected _limit: number = 100;
  protected _offset: number = 0;
  protected _limitToLast: boolean = false;
  protected lastTxid: string | number | null = null;
  protected cache: T[] = [];

  constructor(
    protected tableName: string,
    protected sdk: any,
    protected schemaName: string = "public",
  ) {}

  where(field: string, operator: FilterOperator, value: any): Query<T> {
    this.filters.push({ field, operator, value });
    return this;
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): Query<T> {
    this.sortItems.push({ field, direction });
    return this;
  }

  limit(n: number): Query<T> {
    this._limit = n;
    this._limitToLast = false;
    return this;
  }

  limitToLast(n: number): Query<T> {
    this._limit = n;
    this._limitToLast = true;
    return this;
  }

  offset(n: number): Query<T> {
    this._offset = n;
    return this;
  }

  /**
   * 檢查記錄是否符合目前的所有過濾條件 (客戶端過濾)
   */
  private matchesFilters(record: any): boolean {
    if (!record) return false;
    return this.filters.every((f) => {
      const val = record[f.field];
      const options = Array.isArray(f.value) ? f.value : [f.value];
      switch (f.operator) {
        case "==":
          return val == f.value;
        case "!=":
          return val != f.value;
        case ">":
          return val > f.value;
        case "<":
          return val < f.value;
        case ">=":
          return val >= f.value;
        case "<=":
          return val <= f.value;
        case "in":
          return options.some((option) => option == val);
        case "not-in":
          return options.every((option) => option != val);
        case "contains":
          return String(val)
            .toLowerCase()
            .includes(String(f.value).toLowerCase());
        case "array-contains":
          return Array.isArray(val)
            ? val.some((item) => item == f.value)
            : false;
        case "array-contains-any":
          return Array.isArray(val)
            ? val.some((item) => options.some((option) => option == item))
            : false;
        default:
          return true;
      }
    });
  }

  private ensureLimitToLastReady() {
    if (this._limitToLast && this.sortItems.length === 0) {
      throw new Error(
        "limitToLast() 需要至少一個 orderBy()，以確保結果排序穩定。",
      );
    }
  }

  private compareValues(a: any, b: any): number {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (a === b) return 0;
    return a > b ? 1 : -1;
  }

  private applySort(records: T[]): T[] {
    if (this.sortItems.length === 0) return [...records];

    return [...records].sort((left: any, right: any) => {
      for (const sort of this.sortItems) {
        const diff = this.compareValues(
          left?.[sort.field],
          right?.[sort.field],
        );
        if (diff !== 0) {
          return sort.direction === "asc" ? diff : -diff;
        }
      }
      return 0;
    });
  }

  private applyWindow(records: T[]): T[] {
    const sorted = this.applySort(records);
    const start = Math.max(0, this._offset);

    if (this._limitToLast) {
      const sliced = start > 0 ? sorted.slice(start) : sorted;
      if (this._limit <= 0) return sliced;
      const begin = Math.max(0, sliced.length - this._limit);
      return sliced.slice(begin);
    }

    if (this._limit <= 0) return sorted.slice(start);
    return sorted.slice(start, start + this._limit);
  }

  async onSnapshot(callback: (snapshot: DbEvent<T[]>) => void) {
    this.ensureLimitToLastReady();

    // 1. 獲取初始快照 (帶過濾)
    try {
      const initialSort = this._limitToLast
        ? this.sortItems.map((item) => ({
            ...item,
            direction: item.direction === "asc" ? "desc" : "asc",
          }))
        : this.sortItems;

      const initialData = await this.sdk.data.list.query({
        tableName: this.tableName,
        schemaName: this.schemaName,
        where: this.filters,
        orderBy: initialSort,
        limit: this._limit,
        offset: this._offset,
      });
      const normalizedInitial = this._limitToLast
        ? (initialData as T[]).reverse()
        : initialData;
      this.cache = this.applyWindow(normalizedInitial);

      callback({
        timestamp: new Date().toISOString(),
        txid: 0,
        action: "initial",
        schema: this.schemaName,
        table: this.tableName,
        record: this.cache,
        old_record: null,
      });
    } catch (err) {
      console.error(
        `Failed to fetch snapshot for ${this.schemaName}.${this.tableName}:`,
        err,
      );
    }

    // 2. 訂閱變更並自動維護快取 (含過濾邏輯)
    const subscription = this.sdk.onDbEvent.subscribe(
      { lastTxid: this.lastTxid },
      {
        onData: (event: DbEvent<T>) => {
          if (
            event.table !== this.tableName ||
            (event.schema && event.schema !== this.schemaName)
          )
            return;

          if (event.txid) this.lastTxid = event.txid;

          const record = event.record as any;
          const oldRecord = event.old_record as any;

          // 判斷該變更是否影響目前查詢的結果集
          const isMatch = this.matchesFilters(record);
          const wasMatch = this.matchesFilters(oldRecord);

          let changed = false;

          if (event.action === "insert" && isMatch) {
            this.cache = [...this.cache, record];
            changed = true;
          } else if (event.action === "update") {
            const id = record.id;
            const exists = this.cache.some((item: any) => item.id === id);

            if (isMatch && !exists) {
              // 原本不符合但現在符合了
              this.cache = [...this.cache, record];
              changed = true;
            } else if (isMatch && exists) {
              // 依然符合，更新內容
              this.cache = this.cache.map((item: any) =>
                item.id === id ? record : item,
              );
              changed = true;
            } else if (!isMatch && exists) {
              // 原本符合但現在不符合了，移除
              this.cache = this.cache.filter((item: any) => item.id !== id);
              changed = true;
            }
          } else if (event.action === "delete" && wasMatch) {
            const id = oldRecord.id;
            this.cache = this.cache.filter((item: any) => item.id !== id);
            changed = true;
          }

          // 如果快取發生變動，執行回呼
          if (changed) {
            this.cache = this.applyWindow(this.cache);
            callback({
              ...event,
              record: this.cache,
            } as DbEvent<T[]>);
          }
        },
        onError: (err: any) => {
          console.error(`Subscription error for query ${this.tableName}:`, err);
        },
      },
    );

    return () => subscription.unsubscribe();
  }

  async valueChanges(callback: (records: T[]) => void) {
    return this.onSnapshot(({ record }) => {
      callback(record as T[]);
    });
  }

  async subscribe(callback: (snapshot: DbEvent<T[]>) => void) {
    return this.onSnapshot(callback);
  }

  async get(): Promise<T[]> {
    this.ensureLimitToLastReady();

    const initialSort = this._limitToLast
      ? this.sortItems.map((item) => ({
          ...item,
          direction: item.direction === "asc" ? "desc" : "asc",
        }))
      : this.sortItems;

    const rows = await this.sdk.data.list.query({
      tableName: this.tableName,
      schemaName: this.schemaName,
      where: this.filters,
      orderBy: initialSort,
      limit: this._limit,
      offset: this._offset,
    });

    const normalizedRows = this._limitToLast ? rows.reverse() : rows;
    this.cache = this.applyWindow(normalizedRows);
    return this.cache;
  }
}

/**
 * Collection 繼承自 Query
 */
export class Collection<T = any> extends Query<T> {
  constructor(tableName: string, sdk: any, schemaName: string = "public") {
    super(tableName, sdk, schemaName);
  }

  async add(record: Partial<T>): Promise<T> {
    return this.sdk.data.add.mutate({
      tableName: this.tableName,
      schemaName: this.schemaName,
      record,
    });
  }

  doc(id: string | number, idField: string = "id"): Document<T> {
    return new Document<T>(
      this.tableName,
      id,
      this.sdk,
      idField,
      this.schemaName,
    );
  }
}

export class Document<T = any> {
  private cache: T | null = null;
  private lastTxid: string | number | null = null;

  constructor(
    private tableName: string,
    private id: string | number,
    private sdk: any,
    private idField: string = "id",
    private schemaName: string = "public",
  ) {}

  async get(): Promise<T | null> {
    return this.sdk.data.get.query({
      tableName: this.tableName,
      schemaName: this.schemaName,
      id: this.id,
      idField: this.idField,
    });
  }

  async onSnapshot(callback: (snapshot: DbEvent<T | null>) => void) {
    try {
      const initialDoc = await this.get();
      this.cache = initialDoc;

      callback({
        timestamp: new Date().toISOString(),
        txid: 0,
        action: "initial",
        schema: this.schemaName,
        table: this.tableName,
        record: this.cache,
        old_record: null,
      });
    } catch (err) {
      console.error(
        `Failed to fetch initial document for ${this.schemaName}.${this.tableName}/${this.id}:`,
        err,
      );
    }

    const subscription = this.sdk.onDbEvent.subscribe(
      { lastTxid: this.lastTxid },
      {
        onData: (event: DbEvent<T>) => {
          if (
            event.table !== this.tableName ||
            (event.schema && event.schema !== this.schemaName)
          )
            return;

          if (event.txid) this.lastTxid = event.txid;

          const currentRecord = event.record as any;
          const oldRecord = event.old_record as any;

          const matchesId =
            (currentRecord && currentRecord[this.idField] == this.id) ||
            (oldRecord && oldRecord[this.idField] == this.id);

          if (matchesId) {
            this.cache = event.action === "delete" ? null : currentRecord;
            callback({
              ...event,
              record: this.cache,
            });
          }
        },
        onError: (err: any) => {
          console.error(
            `Subscription error for document ${this.tableName}/${this.id}:`,
            err,
          );
        },
      },
    );

    return () => subscription.unsubscribe();
  }

  async valueChanges(callback: (record: T | null) => void) {
    return this.onSnapshot(({ record }) => {
      callback(record as T | null);
    });
  }

  async subscribe(callback: (snapshot: DbEvent<T | null>) => void) {
    return this.onSnapshot(callback);
  }

  async update(record: Partial<T>): Promise<T | null> {
    return this.sdk.data.update.mutate({
      tableName: this.tableName,
      schemaName: this.schemaName,
      id: this.id,
      idField: this.idField,
      record,
    });
  }

  async delete(): Promise<T | null> {
    return this.sdk.data.delete.mutate({
      tableName: this.tableName,
      schemaName: this.schemaName,
      id: this.id,
      idField: this.idField,
    });
  }

  async set(record: Partial<T>, options: SetOptions = {}): Promise<T | null> {
    return this.sdk.data.set.mutate({
      tableName: this.tableName,
      schemaName: this.schemaName,
      id: this.id,
      idField: this.idField,
      record,
      merge: options.merge ?? false,
    });
  }
}

/**
 * WriteBatch - 批量寫入支援
 */
export class WriteBatch {
  private operations: any[] = [];

  constructor(private sdk: any) {}

  set<T = any>(
    doc: Document<T>,
    record: Partial<T>,
    options: SetOptions = {},
  ): WriteBatch {
    this.operations.push({
      type: "set",
      tableName: (doc as any).tableName,
      schemaName: (doc as any).schemaName,
      id: (doc as any).id,
      idField: (doc as any).idField,
      record,
      merge: options.merge ?? false,
    });
    return this;
  }

  update<T = any>(doc: Document<T>, record: Partial<T>): WriteBatch {
    this.operations.push({
      type: "update",
      tableName: (doc as any).tableName,
      schemaName: (doc as any).schemaName,
      id: (doc as any).id,
      idField: (doc as any).idField,
      record,
    });
    return this;
  }

  delete(doc: Document): WriteBatch {
    this.operations.push({
      type: "delete",
      tableName: (doc as any).tableName,
      schemaName: (doc as any).schemaName,
      id: (doc as any).id,
      idField: (doc as any).idField,
    });
    return this;
  }

  async commit(): Promise<void> {
    if (this.operations.length === 0) return;
    await this.sdk.data.batch.mutate({ operations: this.operations });
    this.operations = [];
  }
}

export class VanillaFirestore {
  private trpc: any;
  private userId: string | null = null;

  constructor(private url: string) {
    this.initTrpc();
  }

  private initTrpc() {
    const baseUrl = this.url.endsWith("/") ? this.url : `${this.url}/`;
    const wsUrl = `${this.url.includes("https") ? "wss" : "ws"}://${this.url.split("//")[1].split("/")[0]}/trpc${this.userId ? `?token=${this.userId}` : ""}`;

    this.trpc = createTRPCProxyClient<AppRouter>({
      links: [
        splitLink({
          condition(op) {
            return op.type === "subscription";
          },
          true: this.getEndingLink(wsUrl),
          false: httpBatchLink({
            url: `${baseUrl}trpc`,
            headers: () => {
              return this.userId
                ? {
                    Authorization: `Bearer ${this.userId}`,
                  }
                : {};
            },
          }),
        }),
      ],
    });
  }

  private getEndingLink(wsUrl: string) {
    if (typeof window === "undefined") {
      return httpBatchLink({
        url: this.url.endsWith("/") ? `${this.url}trpc` : `${this.url}/trpc`,
        headers: () => {
          return this.userId
            ? {
                Authorization: `Bearer ${this.userId}`,
              }
            : {};
        },
      });
    }
    const client = createWSClient({
      url: wsUrl,
    });
    return wsLink<AppRouter>({
      client,
    });
  }

  auth(userId: string) {
    this.userId = userId;
    this.initTrpc();
    return this;
  }

  signOut() {
    this.userId = null;
    this.initTrpc();
    return this;
  }

  batch() {
    return new WriteBatch(this.trpc);
  }

  collection<T = any>(name: string, schema: string = "public") {
    return new Collection<T>(name, this.trpc, schema);
  }

  doc<T = any>(
    name: string,
    id: string | number,
    idField: string = "id",
    schema: string = "public",
  ) {
    return new Document<T>(name, id, this.trpc, idField, schema);
  }

  get client() {
    return this.trpc;
  }
}

export function createSdk(url: string) {
  return new VanillaFirestore(url);
}
