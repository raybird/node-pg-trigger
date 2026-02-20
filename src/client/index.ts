import {
  createTRPCProxyClient,
  httpBatchLink,
  wsLink,
  splitLink,
} from "@trpc/client";
import { createWSClient } from "@trpc/client";
import type { AppRouter } from "../server/router";
import { PersistenceProvider, IndexedDBPersistence } from "./persistence";

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
  protected relations: RelationConfig[] = [];

  constructor(
    protected tableName: string,
    protected sdk: VanillaFirestore,
    protected schemaName: string = "public",
  ) {}

  where(field: string, operator: FilterOperator, value: any): Query<T> {
    this.filters.push({ field, operator, value });
    return this;
  }

  include(name: string, config: any): Query<T> {
    if (!this._include) this._include = {};
    this._include[name] = config;
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
    const relStr = JSON.stringify(this.relations);
    return `query:${this.schemaName}.${this.tableName}:${filterStr}:${sortStr}:${relStr}:${this._limit}:${this._offset}`;
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

  private ensureQueryReady() {
    if (this._limitToLast && this.sortItems.length === 0) {
      throw new Error(
        "limitToLast() 需要至少一個 orderBy()，以確保結果排序穩定。",
      );
    }

    if ((this._startCursor || this._endCursor) && this.sortItems.length === 0) {
      throw new Error(
        "startAt/startAfter/endAt/endBefore 需要至少一個 orderBy()。",
      );
    }
  }

  private applyCursors(records: T[]): T[] {
    if (!this._startCursor && !this._endCursor) return records;
    if (this.sortItems.length === 0) return records;

    const primarySort = this.sortItems[0];
    const field = primarySort.field;
    const direction = primarySort.direction;

    return records.filter((row: any) => {
      const value = row?.[field];

      if (this._startCursor) {
        const diff = this.compareValues(value, this._startCursor.value);
        const normalized = direction === "asc" ? diff : -diff;
        if (this._startCursor.inclusive ? normalized < 0 : normalized <= 0) {
          return false;
        }
      }

      if (this._endCursor) {
        const diff = this.compareValues(value, this._endCursor.value);
        const normalized = direction === "asc" ? diff : -diff;
        if (this._endCursor.inclusive ? normalized > 0 : normalized >= 0) {
          return false;
        }
      }

      return true;
    });
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
    const cursorApplied = this.applyCursors(sorted);
    const start = Math.max(0, this._offset);

    if (this._limitToLast) {
      const sliced = start > 0 ? cursorApplied.slice(start) : cursorApplied;
      if (this._limit <= 0) return sliced;
      const begin = Math.max(0, sliced.length - this._limit);
      return sliced.slice(begin);
    }

    if (this._limit <= 0) return cursorApplied.slice(start);
    return cursorApplied.slice(start, start + this._limit);
  }

  protected async resolveRelations(records: T[]): Promise<T[]> {
    if (this.relations.length === 0 || records.length === 0) return records;

    const resolved = await Promise.all(records.map(async (record: any) => {
      const updates: any = {};
      for (const rel of this.relations) {
        const val = record[rel.localField];
        if (val === undefined || val === null) {
          updates[rel.name] = rel.type === "1:1" ? null : [];
          continue;
        }

        if (rel.type === "1:1") {
          const doc = this.sdk.doc(rel.targetTable, val, rel.targetField, rel.schemaName);
          updates[rel.name] = await doc.get();
        } else {
          const query = this.sdk.collection(rel.targetTable, rel.schemaName)
            .where(rel.targetField, "==", val);
          updates[rel.name] = await query.get();
        }
      }
      return { ...record, ...updates };
    }));

    return resolved;
  }

  async onSnapshot(callback: (snapshot: DbEvent<T[]>) => void) {
    this.ensureQueryReady();

    // 0. 嘗試從本地快取載入
    if (this.sdk.persistence) {
      try {
        const cached = await this.sdk.persistence.get(this.getStorageKey());
        if (cached && Array.isArray(cached)) {
          this.cache = cached;
          callback({
            timestamp: new Date().toISOString(),
            txid: 0,
            action: "initial",
            schema: this.schemaName,
            table: this.tableName,
            record: this.cache,
            old_record: null,
            metadata: { fromCache: true, hasPendingWrites: false },
          });
        }
      } catch (err) {
        console.warn(`[Persistence] Failed to load cache for ${this.tableName}`, err);
      }
    }

    // 1. 獲取初始快照 (帶過濾)
    try {
      const initialSort = this._limitToLast
        ? this.sortItems.map((item) => ({
            ...item,
            direction: item.direction === "asc" ? "desc" : "asc",
          }))
        : this.sortItems;

      const initialData = await this.sdk.client.data.list.query({
        tableName: this.tableName,
        schemaName: this.schemaName,
        where: this.filters,
        orderBy: initialSort,
        limit: this._limit,
        offset: this._offset,
      });
      const initialRows = this.toModels(initialData as any[]);
      const normalizedInitial = this._limitToLast
        ? initialRows.reverse()
        : initialRows;
      
      // 展開關聯
      this.cache = await this.resolveRelations(this.applyWindow(normalizedInitial as T[]));

      callback({
        timestamp: new Date().toISOString(),
        txid: 0,
        action: "initial",
        schema: this.schemaName,
        table: this.tableName,
        record: this.cache,
        old_record: null,
        metadata: { fromCache: false, hasPendingWrites: false },
      });
    } catch (err) {
      console.error(
        `Failed to fetch snapshot for ${this.schemaName}.${this.tableName}:`,
        err,
      );
    }

    // 2. 訂閱變更並自動維護快取 (含過濾邏輯)
    const handleEvent = async (event: any, isOptimistic: boolean = false) => {
      if (
        event.table !== this.tableName ||
        (event.schema && event.schema !== this.schemaName)
      )
        return;

      if (event.txid && !isOptimistic) this.lastTxid = event.txid;

      const record = this.toModel(event.record as any) as any;
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
        
        // 重新解析關聯
        this.cache = await this.resolveRelations(this.cache);

        // 更新本地持久化快取 (非樂觀更新時)
        if (!isOptimistic && this.sdk.persistence) {
          this.sdk.persistence.set(this.getStorageKey(), this.cache).catch(() => {});
        }

        callback({
          ...event,
          record: this.cache,
          metadata: { fromCache: false, hasPendingWrites: isOptimistic },
        } as DbEvent<T[]>);
      }
    };

    const serverSub = this.sdk.client.onDbEvent.subscribe(
      { lastTxid: this.lastTxid },
      {
        onData: (event: any) => handleEvent(event, false),
        onError: (err: any) => {
          console.error(`Subscription error for query ${this.tableName}:`, err);
        },
      },
    );

    const localSub = this.sdk.localEvents.subscribe((event) =>
      handleEvent(event, true),
    );

    return () => {
      serverSub.unsubscribe();
      localSub();
    };
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
    this.ensureQueryReady();

    const initialSort = this._limitToLast
      ? this.sortItems.map((item) => ({
          ...item,
          direction: item.direction === "asc" ? "desc" : "asc",
        }))
      : this.sortItems;

    const rows = await this.sdk.client.data.list.query({
      tableName: this.tableName,
      schemaName: this.schemaName,
      where: this.filters,
      orderBy: initialSort,
      limit: this._limit,
      offset: this._offset,
    });

    const rowModels = this.toModels(rows as any[]);
    const normalizedRows = this._limitToLast ? rowModels.reverse() : rowModels;
    this.cache = this.applyWindow(normalizedRows);
    return this.cache;
  }

  async count(): Promise<number> {
    const result = await this.sdk.client.data.aggregate.query({
      tableName: this.tableName,
      schemaName: this.schemaName,
      where: this.filters,
      aggregations: [{ type: "count", alias: "count" }],
    });
    return Number(result.count);
  }

  async aggregate(
    spec: Record<string, { type: string; field?: string }>,
  ): Promise<Record<string, any>> {
    const aggregations = Object.entries(spec).map(([alias, s]) => ({
      type: s.type as any,
      field: s.field,
      alias,
    }));

    const result = await this.sdk.client.data.aggregate.query({
      tableName: this.tableName,
      schemaName: this.schemaName,
      where: this.filters,
      aggregations,
    });

    // 將結果中的數值字串轉為 Number
    const finalResult: Record<string, any> = {};
    for (const [key, value] of Object.entries(result)) {
      finalResult[key] = value !== null ? Number(value) : null;
    }
    return finalResult;
  }
}

/**
 * 聚合輔助函式 (Firestore-like)
 */
export const count = () => ({ type: "count" });
export const sum = (field: string) => ({ type: "sum", field });
export const average = (field: string) => ({ type: "avg", field });
export const minimum = (field: string) => ({ type: "min", field });
export const maximum = (field: string) => ({ type: "max", field });

/**
 * Collection 繼承自 Query
 */
export class Collection<T = any> extends Query<T> {
  constructor(
    tableName: string,
    sdk: VanillaFirestore,
    schemaName: string = "public",
    converter: FirestoreDataConverter<T> | null = null,
  ) {
    super(tableName, sdk, schemaName);
    this.converter = converter;
  }

  withConverter<U = any>(converter: FirestoreDataConverter<U>): Collection<U> {
    return new Collection<U>(
      this.tableName,
      this.sdk,
      this.schemaName,
      converter,
    );
  }

  async add(record: Partial<T>): Promise<T> {
    const wireData = this.toWire(record);

    // 樂觀更新：發布本地 insert 事件
    this.sdk.localEvents.publish({
      timestamp: new Date().toISOString(),
      txid: 0,
      action: "insert",
      schema: this.schemaName,
      table: this.tableName,
      record: wireData,
      old_record: null,
      metadata: { fromCache: false, hasPendingWrites: true },
    });

    return this.sdk.client.data.add.mutate({
      tableName: this.tableName,
      schemaName: this.schemaName,
      record: wireData,
    });
  }

  doc(id: string | number, idField: string = "id"): Document<T> {
    return new Document<T>(
      this.tableName,
      id,
      this.sdk,
      idField,
      this.schemaName,
      this.converter,
      this.relations
    );
  }
}

export class Document<T = any> {
  private cache: T | null = null;
  private lastTxid: string | number | null = null;
  private _include: Record<string, any> | null = null;

  constructor(
    private tableName: string,
    private id: string | number,
    private sdk: VanillaFirestore,
    private idField: string = "id",
    private schemaName: string = "public",
    private converter: FirestoreDataConverter<T> | null = null,
  ) {}

  include(name: string, config: any): Document<T> {
    if (!this._include) this._include = {};
    this._include[name] = config;
    return this;
  }

  withConverter<U = any>(converter: FirestoreDataConverter<U>): Document<U> {
    const next = new Document<U>(
      this.tableName,
      this.id,
      this.sdk,
      this.idField,
      this.schemaName,
      converter,
    );
    (next as any)._include = this._include ? { ...this._include } : null;
    return next;
  }

  private toModel(data: any): T {
    if (!this.converter) return data as T;
    return this.converter.fromFirestore(data);
  }

  private toWire(model: any): any {
    if (!this.converter || !this.converter.toFirestore) return model;
    return this.converter.toFirestore(model);
  }

  protected getStorageKey(): string {
    return `doc:${this.schemaName}.${this.tableName}:${this.id}`;
  }

  async get(): Promise<T | null> {
    const row = await this.sdk.client.data.get.query({
      tableName: this.tableName,
      schemaName: this.schemaName,
      id: this.id,
      idField: this.idField,
      include: this._include,
    });
    return row ? this.toModel(row) : null;
  }

  async exists(): Promise<boolean> {
    const row = await this.sdk.client.data.get.query({
      tableName: this.tableName,
      schemaName: this.schemaName,
      id: this.id,
      idField: this.idField,
    });
    return row !== null;
  }

  async onSnapshot(callback: (snapshot: DbEvent<T | null>) => void) {
    // 0. 嘗試從本地快取載入
    if (this.sdk.persistence) {
      try {
        const cached = await this.sdk.persistence.get(this.getStorageKey());
        if (cached) {
          this.cache = cached;
          callback({
            timestamp: new Date().toISOString(),
            txid: 0,
            action: "initial",
            schema: this.schemaName,
            table: this.tableName,
            record: this.cache,
            old_record: null,
            metadata: { fromCache: true, hasPendingWrites: false },
          });
        }
      } catch (err) {
        console.warn(`[Persistence] Failed to load cache for doc ${this.tableName}/${this.id}`, err);
      }
    }

    try {
      const initialDoc = await this.get();
      this.cache = initialDoc;
      
      // 更新快取 (若來自伺服器)
      if (this.sdk.persistence && this.cache) {
        this.sdk.persistence.set(this.getStorageKey(), this.cache).catch(() => {});
      }

      callback({
        timestamp: new Date().toISOString(),
        txid: 0,
        action: "initial",
        schema: this.schemaName,
        table: this.tableName,
        record: this.cache,
        old_record: null,
        metadata: { fromCache: false, hasPendingWrites: false },
      });
    } catch (err) {
      console.error(
        `Failed to fetch initial document for ${this.schemaName}.${this.tableName}/${this.id}:`,
        err,
      );
    }

    const handleEvent = async (event: any, isOptimistic: boolean = false) => {
      if (
        event.table !== this.tableName ||
        (event.schema && event.schema !== this.schemaName)
      )
        return;

      if (event.txid && !isOptimistic) this.lastTxid = event.txid;

      const currentRecord = this.toModel(event.record as any) as any;
      const oldRecord = event.old_record as any;

      const matchesId =
        (currentRecord && currentRecord[this.idField] == this.id) ||
        (oldRecord && oldRecord[this.idField] == this.id);

      if (matchesId) {
        this.cache = event.action === "delete" ? null : currentRecord;
        
        // 展開關聯
        this.cache = await this.resolveRelations(this.cache);

        // 更新持久化快取 (非樂觀更新時)
        if (!isOptimistic && this.sdk.persistence) {
          if (event.action === "delete") {
            this.sdk.persistence.remove(this.getStorageKey()).catch(() => {});
          } else {
            this.sdk.persistence.set(this.getStorageKey(), this.cache).catch(() => {});
          }
        }

        callback({
          ...event,
          record: this.cache,
          metadata: { fromCache: false, hasPendingWrites: isOptimistic },
        });
      }
    };

    const serverSub = this.sdk.client.onDbEvent.subscribe(
      { lastTxid: this.lastTxid },
      {
        onData: (event: any) => handleEvent(event, false),
        onError: (err: any) => {
          console.error(
            `Subscription error for document ${this.tableName}/${this.id}:`,
            err,
          );
        },
      },
    );

    const localSub = this.sdk.localEvents.subscribe((event) =>
      handleEvent(event, true),
    );

    return () => {
      serverSub.unsubscribe();
      localSub();
    };
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
    const wireData = this.toWire(record);

    // 樂觀更新
    this.sdk.localEvents.publish({
      timestamp: new Date().toISOString(),
      txid: 0,
      action: "update",
      schema: this.schemaName,
      table: this.tableName,
      record: { ...this.cache, ...wireData },
      old_record: this.cache,
      metadata: { fromCache: false, hasPendingWrites: true },
    });

    const updated = await this.sdk.client.data.update.mutate({
      tableName: this.tableName,
      schemaName: this.schemaName,
      id: this.id,
      idField: this.idField,
      record: wireData,
    });
    return updated ? this.toModel(updated) : null;
  }

  async delete(): Promise<T | null> {
    // 樂觀更新
    this.sdk.localEvents.publish({
      timestamp: new Date().toISOString(),
      txid: 0,
      action: "delete",
      schema: this.schemaName,
      table: this.tableName,
      record: this.cache,
      old_record: this.cache,
      metadata: { fromCache: false, hasPendingWrites: true },
    });

    const deleted = await this.sdk.client.data.delete.mutate({
      tableName: this.tableName,
      schemaName: this.schemaName,
      id: this.id,
      idField: this.idField,
    });
    return deleted ? this.toModel(deleted) : null;
  }

  async set(record: Partial<T>, options: SetOptions = {}): Promise<T | null> {
    const wireData = this.toWire(record);

    // 樂觀更新
    this.sdk.localEvents.publish({
      timestamp: new Date().toISOString(),
      txid: 0,
      action: options.merge ? "update" : "insert",
      schema: this.schemaName,
      table: this.tableName,
      record: options.merge ? { ...this.cache, ...wireData } : wireData,
      old_record: this.cache,
      metadata: { fromCache: false, hasPendingWrites: true },
    });

    const setRow = await this.sdk.client.data.set.mutate({
      tableName: this.tableName,
      schemaName: this.schemaName,
      id: this.id,
      idField: this.idField,
      record: wireData,
      merge: options.merge ?? false,
    });
    return setRow ? this.toModel(setRow) : null;
  }
}

/**
 * WriteBatch - 批量寫入支援
 */
export class WriteBatch {
  protected operations: any[] = [];

  constructor(protected sdk: VanillaFirestore) {}

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

    // 樂觀更新：發布批量本地事件
    this.operations.forEach((op) => {
      this.sdk.localEvents.publish({
        timestamp: new Date().toISOString(),
        txid: 0,
        action: op.type === "set" ? (op.merge ? "update" : "insert") : op.type,
        schema: op.schemaName,
        table: op.tableName,
        record: op.record,
        old_record: null,
        metadata: { fromCache: false, hasPendingWrites: true },
      });
    });

    await this.sdk.client.data.batch.mutate({ operations: this.operations });
    this.operations = [];
  }
}

/**
 * Transaction - 支援「讀取後寫入」的樂觀鎖交易
 */
export class Transaction extends WriteBatch {
  private preconditions = new Map<string, Filter[]>();

  constructor(sdk: VanillaFirestore) {
    super(sdk);
  }

  async get<T = any>(doc: Document<T>): Promise<T | null> {
    const data = await doc.get();
    if (data) {
      // 建立樂觀鎖前置條件 (基於目前讀取到的欄位值)
      // 在工業實作中，通常會基於 version 或 updated_at 欄位
      // 這裡採用全欄位比對以實現「Zero Config」樂觀鎖
      const filters: Filter[] = Object.entries(data)
        .filter(([key, val]) => val !== null && typeof val !== "object") // 僅比對基礎型別
        .map(([key, value]) => ({ field: key, operator: "==", value }));

      this.preconditions.set(this.getDocKey(doc), filters);
    }
    return data;
  }

  private getDocKey(doc: Document): string {
    return `${(doc as any).schemaName}.${(doc as any).tableName}.${(doc as any).id}`;
  }

  set<T = any>(
    doc: Document<T>,
    record: Partial<T>,
    options: SetOptions = {},
  ): Transaction {
    super.set(doc, record, options);
    const filters = this.preconditions.get(this.getDocKey(doc));
    if (filters) {
      this.operations[this.operations.length - 1].where = filters;
    }
    return this;
  }

  update<T = any>(doc: Document<T>, record: Partial<T>): Transaction {
    super.update(doc, record);
    const filters = this.preconditions.get(this.getDocKey(doc));
    if (filters) {
      this.operations[this.operations.length - 1].where = filters;
    }
    return this;
  }

  delete(doc: Document): Transaction {
    super.delete(doc);
    const filters = this.preconditions.get(this.getDocKey(doc));
    if (filters) {
      this.operations[this.operations.length - 1].where = filters;
    }
    return this;
  }
}

export class VanillaFirestore {
  private trpc: any;
  private userId: string | null = null;
  private _localEvents = new LocalEventBus();
  private _persistence: PersistenceProvider | null = null;

  constructor(private url: string) {
    this.initTrpc();
  }

  get localEvents() {
    return this._localEvents;
  }

  get persistence() {
    return this._persistence;
  }

  async enablePersistence(): Promise<void> {
    if (this._persistence) return;
    this._persistence = new IndexedDBPersistence();
  }

  private initTrpc() {
    const baseUrl = this.url.endsWith("/") ? this.url : `${this.url}/`;
    const wsUrl = `${this.url.includes("https") ? "wss" : "ws"}://${this.url.split("//")[1].split("/")[0]}/trpc${this.userId ? `?token=${this.userId}` : ""}`;

    this.trpc = createTRPCProxyClient<AppRouter>({
      links: [
        splitLink({
          condition(op: any) {
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
    return new WriteBatch(this);
  }

  async runTransaction<T>(
    updateFunction: (transaction: Transaction) => Promise<T>,
    maxRetries: number = 5,
  ): Promise<T> {
    let retries = 0;
    while (true) {
      const transaction = new Transaction(this);
      try {
        const result = await updateFunction(transaction);
        await transaction.commit();
        return result;
      } catch (error: any) {
        const isConflict = error.message?.includes("Precondition mismatch");
        if (isConflict && retries < maxRetries) {
          retries++;
          console.warn(
            `🔄 Transaction conflict detected, retrying... (${retries}/${maxRetries})`,
          );
          // 指數避退增加成功率
          await new Promise((res) =>
            setTimeout(res, Math.random() * 100 * retries),
          );
          continue;
        }
        throw error;
      }
    }
  }

  collection<T = any>(name: string, schema: string = "public") {
    return new Collection<T>(name, this, schema);
  }

  doc<T = any>(
    name: string,
    id: string | number,
    idField: string = "id",
    schema: string = "public",
  ) {
    return new Document<T>(name, id, this, idField, schema);
  }

  get client() {
    return this.trpc;
  }
}

export function createSdk(url: string) {
  return new VanillaFirestore(url);
}
