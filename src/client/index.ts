import {
  createTRPCProxyClient,
  httpBatchLink,
  wsLink,
  splitLink,
} from "@trpc/client";
import { createWSClient } from "@trpc/client";
import type { AppRouter } from "../server/router";
import { PersistenceProvider, IndexedDBPersistence } from "./persistence";
import { v4 as uuidv4 } from "uuid";

export interface SnapshotMetadata {
  /**
   * 資料是否來自本地快取 (尚未與伺服器同步)
   */
  fromCache: boolean;
  /**
   * 是否有尚未確認的本地寫入
   */
  hasPendingWrites: boolean;
}

export type DbEvent<T = any> = {
  timestamp: string;
  txid: number;
  action: "insert" | "update" | "delete" | "initial";
  schema: string;
  table: string;
  record: T | T[];
  old_record: T | null;
  metadata: SnapshotMetadata;
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

export interface FirestoreDataConverter<TModel = any> {
  fromFirestore(data: any): TModel;
  toFirestore?(model: Partial<TModel>): any;
}

export interface RelationConfig {
  name: string;
  targetTable: string;
  localField: string;
  targetField: string;
  schemaName?: string;
  type: "1:1" | "1:N";
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

class LocalEventBus {
  private listeners = new Set<(event: DbEvent) => void>();

  publish(event: DbEvent) {
    this.listeners.forEach((l) => l(event));
  }

  subscribe(callback: (event: DbEvent) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}

/**
 * Query 類別 - 支援過濾、排序與分頁
 */
export class Query<T = any> {
  protected filters: Filter[] = [];
  protected sortItems: SortItem[] = [];
  protected _include: Record<string, any> | null = null;
  protected _limit: number = 100;
  protected _offset: number = 0;
  protected _limitToLast: boolean = false;
  protected _startCursor: { value: any; inclusive: boolean } | null = null;
  protected _endCursor: { value: any; inclusive: boolean } | null = null;
  protected lastTxid: string | number | null = null;
  protected cache: T[] = [];
  protected converter: FirestoreDataConverter<T> | null = null;

  constructor(
    protected tableName: string,
    protected sdk: VanillaFirestore,
    protected schemaName: string = "public",
  ) {}

  where(field: string, operator: FilterOperator, value: any): Query<T> {
    this.filters.push({ field, operator, value });
    return this;
  }

  /**
   * include - 展開關聯資料 (伺服器端 JOIN)
   */
  include(nameOrSpec: string | Record<string, any>, config?: any): Query<T> {
    if (typeof nameOrSpec === "string") {
      if (!this._include) this._include = {};
      this._include[nameOrSpec] = config;
    } else {
      this._include = { ...(this._include || {}), ...nameOrSpec };
    }
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

  startAt(value: any): Query<T> {
    this._startCursor = { value, inclusive: true };
    return this;
  }

  startAfter(value: any): Query<T> {
    this._startCursor = { value, inclusive: false };
    return this;
  }

  endAt(value: any): Query<T> {
    this._endCursor = { value, inclusive: true };
    return this;
  }

  endBefore(value: any): Query<T> {
    this._endCursor = { value, inclusive: false };
    return this;
  }

  offset(n: number): Query<T> {
    this._offset = n;
    return this;
  }

  withConverter<U = any>(converter: FirestoreDataConverter<U>): Query<U> {
    const next = new Query<U>(this.tableName, this.sdk, this.schemaName);
    (next as any).filters = [...this.filters];
    (next as any).sortItems = [...this.sortItems];
    (next as any)._include = this._include ? { ...this._include } : null;
    (next as any)._limit = this._limit;
    (next as any)._offset = this._offset;
    (next as any)._limitToLast = this._limitToLast;
    (next as any)._startCursor = this._startCursor
      ? { ...this._startCursor }
      : null;
    (next as any)._endCursor = this._endCursor ? { ...this._endCursor } : null;
    (next as any).lastTxid = this.lastTxid;
    (next as any).converter = converter;
    return next;
  }

  protected toModel(data: any): T {
    if (!this.converter) return data as T;
    return this.converter.fromFirestore(data);
  }

  protected toModels(data: any[]): T[] {
    return data.map((item) => this.toModel(item));
  }

  protected toWire(model: any): any {
    if (!this.converter || !this.converter.toFirestore) return model;
    return this.converter.toFirestore(model);
  }

  protected getStorageKey(): string {
    const filterStr = JSON.stringify(this.filters);
    const sortStr = JSON.stringify(this.sortItems);
    const incStr = JSON.stringify(this._include);
    return `query:${this.schemaName}.${this.tableName}:${filterStr}:${sortStr}:${incStr}:${this._limit}:${this._offset}`;
  }

  private matchesFilters(record: any): boolean {
    if (!record) return false;
    return this.filters.every((f) => {
      const val = record[f.field];
      const options = Array.isArray(f.value) ? f.value : [f.value];
      switch (f.operator) {
        case "==": return val == f.value;
        case "!=": return val != f.value;
        case ">": return val > f.value;
        case "<": return val < f.value;
        case ">=": return val >= f.value;
        case "<=": return val <= f.value;
        case "in": return options.some((option) => option == val);
        case "not-in": return options.every((option) => option != val);
        case "contains": return String(val).toLowerCase().includes(String(f.value).toLowerCase());
        case "array-contains": return Array.isArray(val) ? val.some((item) => item == f.value) : false;
        case "array-contains-any": return Array.isArray(val) ? val.some((item) => options.some((option) => option == item)) : false;
        default: return true;
      }
    });
  }

  private ensureQueryReady() {
    if (this._limitToLast && this.sortItems.length === 0) {
      throw new Error("limitToLast() 需要至少一個 orderBy()。");
    }
    if ((this._startCursor || this._endCursor) && this.sortItems.length === 0) {
      throw new Error("Cursor 分頁需要至少一個 orderBy()。");
    }
  }

  private applyWindow(records: T[]): T[] {
    const sorted = [...records].sort((left: any, right: any) => {
      for (const sort of this.sortItems) {
        const valL = left?.[sort.field];
        const valR = right?.[sort.field];
        if (valL === valR) continue;
        const diff = valL > valR ? 1 : -1;
        return sort.direction === "asc" ? diff : -diff;
      }
      return 0;
    });
    
    // 這裡簡單實現，實際應包含 cursor 邏輯
    const start = Math.max(0, this._offset);
    if (this._limitToLast) {
        return sorted.slice(-this._limit);
    }
    return sorted.slice(start, start + this._limit);
  }

  protected async patchRelations(record: any): Promise<T> {
    if (!this._include || !record) return record;
    const full = await this.sdk.doc(this.tableName, record.id, "id", this.schemaName)
      .include(this._include)
      .get();
    return full || record;
  }

  async onSnapshot(callback: (snapshot: DbEvent<T[]>) => void) {
    this.ensureQueryReady();

    if (this.sdk.persistence) {
      try {
        const cached = await this.sdk.persistence.get(this.getStorageKey());
        if (cached && Array.isArray(cached)) {
          this.cache = cached;
          callback({
            timestamp: new Date().toISOString(), txid: 0, action: "initial",
            schema: this.schemaName, table: this.tableName, record: this.cache,
            old_record: null, metadata: { fromCache: true, hasPendingWrites: false },
          });
        }
      } catch (err) {}
    }

    try {
      const initialData = await this.sdk.client.data.list.query({
        tableName: this.tableName, schemaName: this.schemaName,
        where: this.filters, orderBy: this.sortItems,
        limit: this._limit, offset: this._offset, include: this._include || undefined
      });
      this.cache = this.toModels(initialData as any[]);
      callback({
        timestamp: new Date().toISOString(), txid: 0, action: "initial",
        schema: this.schemaName, table: this.tableName, record: this.cache,
        old_record: null, metadata: { fromCache: false, hasPendingWrites: false },
      });
    } catch (err) {}

    const handleEvent = async (event: any, isOptimistic: boolean = false) => {
      if (event.table !== this.tableName || (event.schema && event.schema !== this.schemaName)) return;
      if (event.txid && !isOptimistic) this.lastTxid = event.txid;

      let record = this.toModel(event.record as any) as any;
      const isMatch = this.matchesFilters(record);
      let changed = false;

      // 簡化維護邏輯
      if (event.action === "insert" && isMatch) {
        if (this._include && !isOptimistic) record = await this.patchRelations(record);
        this.cache = [...this.cache, record];
        changed = true;
      } else if (event.action === "update") {
        const id = (record as any).id;
        const exists = this.cache.some((item: any) => item.id === id);
        if (isMatch) {
          if (this._include && !isOptimistic) record = await this.patchRelations(record);
          this.cache = exists ? this.cache.map((i: any) => i.id === id ? record : i) : [...this.cache, record];
          changed = true;
        } else if (exists) {
          this.cache = this.cache.filter((i: any) => i.id !== id);
          changed = true;
        }
      } else if (event.action === "delete") {
        const id = (event.old_record as any)?.id;
        if (this.cache.some((i: any) => i.id === id)) {
          this.cache = this.cache.filter((i: any) => i.id !== id);
          changed = true;
        }
      }

      if (changed) {
        this.cache = this.applyWindow(this.cache);
        if (!isOptimistic && this.sdk.persistence) {
          this.sdk.persistence.set(this.getStorageKey(), this.cache).catch(() => {});
        }
        callback({
          ...event, record: this.cache,
          metadata: { fromCache: false, hasPendingWrites: isOptimistic },
        } as DbEvent<T[]>);
      }
    };

    const serverSub = this.sdk.client.onDbEvent.subscribe({ lastTxid: this.lastTxid }, {
      onData: (event: any) => handleEvent(event, false),
    });
    const localSub = this.sdk.localEvents.subscribe((event) => handleEvent(event, true));
    return () => { serverSub.unsubscribe(); localSub(); };
  }

  async get(): Promise<T[]> {
    const data = await this.sdk.client.data.list.query({
      tableName: this.tableName, schemaName: this.schemaName,
      where: this.filters, orderBy: this.sortItems,
      limit: this._limit, offset: this._offset, include: this._include || undefined
    });
    return this.toModels(data as any[]);
  }

  async count(): Promise<number> {
    const result = await this.sdk.client.data.aggregate.query({
      tableName: this.tableName, schemaName: this.schemaName, where: this.filters,
      aggregations: [{ type: "count", alias: "count" }],
    });
    return Number(result.count);
  }
}

/**
 * Collection 類別
 */
export class Collection<T = any> extends Query<T> {
  constructor(tableName: string, sdk: VanillaFirestore, schemaName: string = "public", converter: FirestoreDataConverter<T> | null = null) {
    super(tableName, sdk, schemaName);
    this.converter = converter;
  }

  get id(): string { return this.tableName; }
  get path(): string { return `${this.schemaName}/${this.tableName}`; }

  async add(record: Partial<T>): Promise<Document<T>> {
    const wireData = this.toWire(record);
    const result = await this.sdk.client.data.add.mutate({ tableName: this.tableName, schemaName: this.schemaName, record: wireData });
    return this.doc(result.id);
  }

  doc(id?: string | number, idField: string = "id"): Document<T> {
    const finalId = id ?? uuidv4();
    return new Document<T>(this.tableName, finalId, this.sdk, idField, this.schemaName, this.converter);
  }
}

/**
 * Document 類別
 */
export class Document<T = any> {
  private cache: T | null = null;
  private _include: Record<string, any> | null = null;

  constructor(private tableName: string, private _id: string | number, private sdk: VanillaFirestore, private idField: string = "id", private schemaName: string = "public", private converter: FirestoreDataConverter<T> | null = null) {}

  get id(): string | number { return this._id; }
  get path(): string { return `${this.schemaName}/${this.tableName}/${this._id}`; }

  include(nameOrSpec: string | Record<string, any>, config?: any): Document<T> {
    if (typeof nameOrSpec === "string") {
      if (!this._include) this._include = {};
      this._include[nameOrSpec] = config;
    } else {
      this._include = { ...(this._include || {}), ...nameOrSpec };
    }
    return this;
  }

  async get(): Promise<T | null> {
    const row = await this.sdk.client.data.get.query({
      tableName: this.tableName, schemaName: this.schemaName,
      id: this._id, idField: this.idField, include: this._include || undefined
    });
    return row ? (this.converter ? this.converter.fromFirestore(row) : row as T) : null;
  }

  async update(record: Partial<T>): Promise<T | null> {
    const updated = await this.sdk.client.data.update.mutate({
      tableName: this.tableName, schemaName: this.schemaName,
      id: this._id, idField: this.idField, record
    });
    return updated;
  }

  async delete(): Promise<void> {
    await this.sdk.client.data.delete.mutate({ tableName: this.tableName, schemaName: this.schemaName, id: this._id, idField: this.idField });
  }
}

export class VanillaFirestore {
  private trpc: any;
  private userId: string | null = null;
  private _localEvents = new LocalEventBus();
  private _persistence: PersistenceProvider | null = null;

  constructor(private url: string) { this.initTrpc(); }
  get localEvents() { return this._localEvents; }
  get persistence() { return this._persistence; }

  async enablePersistence(): Promise<void> {
    if (!this._persistence) this._persistence = new IndexedDBPersistence();
  }

  private initTrpc() {
    const baseUrl = this.url.endsWith("/") ? this.url : `${this.url}/`;
    this.trpc = createTRPCProxyClient<AppRouter>({
      links: [
        splitLink({
          condition: (op: any) => op.type === "subscription",
          true: wsLink({ client: createWSClient({ url: `${this.url.replace("http", "ws")}/trpc` }) }),
          false: httpBatchLink({ url: `${baseUrl}trpc` }),
        }),
      ],
    });
  }

  collection<T = any>(name: string, schema: string = "public") { return new Collection<T>(name, this, schema); }
  doc<T = any>(name: string, id: string | number, idField: string = "id", schema: string = "public") { return new Document<T>(name, id, this, idField, schema); }
  get client() { return this.trpc; }
}

export function createSdk(url: string) { return new VanillaFirestore(url); }
