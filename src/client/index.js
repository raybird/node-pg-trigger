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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VanillaFirestore = exports.Transaction = exports.WriteBatch = exports.Document = exports.Collection = exports.maximum = exports.minimum = exports.average = exports.sum = exports.count = exports.Query = exports.FieldValue = void 0;
exports.createSdk = createSdk;
const client_1 = require("@trpc/client");
const client_2 = require("@trpc/client");
/**
 * FieldValue - 支援特殊伺服器端值的處理
 */
class FieldValue {
    constructor(type, value) {
        this.type = type;
        this.value = value;
    }
    static serverTimestamp() {
        return new FieldValue("SERVER_TIMESTAMP");
    }
    static increment(n) {
        return new FieldValue("INCREMENT", n);
    }
    static delete() {
        return new FieldValue("DELETE_FIELD");
    }
    static arrayUnion(...elements) {
        return new FieldValue("ARRAY_UNION", elements);
    }
    static arrayRemove(...elements) {
        return new FieldValue("ARRAY_REMOVE", elements);
    }
    static isFieldValue(val) {
        return val && val._isFieldValue === true;
    }
    // 為了跨環境傳輸時保持型別資訊
    get _isFieldValue() {
        return true;
    }
}
exports.FieldValue = FieldValue;
class LocalEventBus {
    constructor() {
        this.listeners = new Set();
    }
    publish(event) {
        this.listeners.forEach((l) => l(event));
    }
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
}
/**
 * Query 類別 - 支援過濾、排序與分頁
 */
class Query {
    constructor(tableName, sdk, schemaName = "public") {
        this.tableName = tableName;
        this.sdk = sdk;
        this.schemaName = schemaName;
        this.filters = [];
        this.sortItems = [];
        this._limit = 100;
        this._offset = 0;
        this._limitToLast = false;
        this._startCursor = null;
        this._endCursor = null;
        this.lastTxid = null;
        this.cache = [];
        this.converter = null;
    }
    where(field, operator, value) {
        this.filters.push({ field, operator, value });
        return this;
    }
    orderBy(field, direction = "asc") {
        this.sortItems.push({ field, direction });
        return this;
    }
    limit(n) {
        this._limit = n;
        this._limitToLast = false;
        return this;
    }
    limitToLast(n) {
        this._limit = n;
        this._limitToLast = true;
        return this;
    }
    startAt(value) {
        this._startCursor = { value, inclusive: true };
        return this;
    }
    startAfter(value) {
        this._startCursor = { value, inclusive: false };
        return this;
    }
    endAt(value) {
        this._endCursor = { value, inclusive: true };
        return this;
    }
    endBefore(value) {
        this._endCursor = { value, inclusive: false };
        return this;
    }
    offset(n) {
        this._offset = n;
        return this;
    }
    withConverter(converter) {
        const next = new Query(this.tableName, this.sdk, this.schemaName);
        next.filters = [...this.filters];
        next.sortItems = [...this.sortItems];
        next._limit = this._limit;
        next._offset = this._offset;
        next._limitToLast = this._limitToLast;
        next._startCursor = this._startCursor
            ? Object.assign({}, this._startCursor) : null;
        next._endCursor = this._endCursor ? Object.assign({}, this._endCursor) : null;
        next.lastTxid = this.lastTxid;
        next.converter = converter;
        return next;
    }
    toModel(data) {
        if (!this.converter)
            return data;
        return this.converter.fromFirestore(data);
    }
    toModels(data) {
        return data.map((item) => this.toModel(item));
    }
    toWire(model) {
        if (!this.converter || !this.converter.toFirestore)
            return model;
        return this.converter.toFirestore(model);
    }
    /**
     * 檢查記錄是否符合目前的所有過濾條件 (客戶端過濾)
     */
    matchesFilters(record) {
        if (!record)
            return false;
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
    ensureQueryReady() {
        if (this._limitToLast && this.sortItems.length === 0) {
            throw new Error("limitToLast() 需要至少一個 orderBy()，以確保結果排序穩定。");
        }
        if ((this._startCursor || this._endCursor) && this.sortItems.length === 0) {
            throw new Error("startAt/startAfter/endAt/endBefore 需要至少一個 orderBy()。");
        }
    }
    applyCursors(records) {
        if (!this._startCursor && !this._endCursor)
            return records;
        if (this.sortItems.length === 0)
            return records;
        const primarySort = this.sortItems[0];
        const field = primarySort.field;
        const direction = primarySort.direction;
        return records.filter((row) => {
            const value = row === null || row === void 0 ? void 0 : row[field];
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
    compareValues(a, b) {
        if (a == null && b == null)
            return 0;
        if (a == null)
            return 1;
        if (b == null)
            return -1;
        if (a === b)
            return 0;
        return a > b ? 1 : -1;
    }
    applySort(records) {
        if (this.sortItems.length === 0)
            return [...records];
        return [...records].sort((left, right) => {
            for (const sort of this.sortItems) {
                const diff = this.compareValues(left === null || left === void 0 ? void 0 : left[sort.field], right === null || right === void 0 ? void 0 : right[sort.field]);
                if (diff !== 0) {
                    return sort.direction === "asc" ? diff : -diff;
                }
            }
            return 0;
        });
    }
    applyWindow(records) {
        const sorted = this.applySort(records);
        const cursorApplied = this.applyCursors(sorted);
        const start = Math.max(0, this._offset);
        if (this._limitToLast) {
            const sliced = start > 0 ? cursorApplied.slice(start) : cursorApplied;
            if (this._limit <= 0)
                return sliced;
            const begin = Math.max(0, sliced.length - this._limit);
            return sliced.slice(begin);
        }
        if (this._limit <= 0)
            return cursorApplied.slice(start);
        return cursorApplied.slice(start, start + this._limit);
    }
    onSnapshot(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            this.ensureQueryReady();
            // 1. 獲取初始快照 (帶過濾)
            try {
                const initialSort = this._limitToLast
                    ? this.sortItems.map((item) => (Object.assign(Object.assign({}, item), { direction: item.direction === "asc" ? "desc" : "asc" })))
                    : this.sortItems;
                const initialData = yield this.sdk.client.data.list.query({
                    tableName: this.tableName,
                    schemaName: this.schemaName,
                    where: this.filters,
                    orderBy: initialSort,
                    limit: this._limit,
                    offset: this._offset,
                });
                const initialRows = this.toModels(initialData);
                const normalizedInitial = this._limitToLast
                    ? initialRows.reverse()
                    : initialRows;
                this.cache = this.applyWindow(normalizedInitial);
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
            }
            catch (err) {
                console.error(`Failed to fetch snapshot for ${this.schemaName}.${this.tableName}:`, err);
            }
            // 2. 訂閱變更並自動維護快取 (含過濾邏輯)
            const handleEvent = (event, isOptimistic = false) => {
                if (event.table !== this.tableName ||
                    (event.schema && event.schema !== this.schemaName))
                    return;
                if (event.txid && !isOptimistic)
                    this.lastTxid = event.txid;
                const record = this.toModel(event.record);
                const oldRecord = event.old_record;
                // 判斷該變更是否影響目前查詢的結果集
                const isMatch = this.matchesFilters(record);
                const wasMatch = this.matchesFilters(oldRecord);
                let changed = false;
                if (event.action === "insert" && isMatch) {
                    this.cache = [...this.cache, record];
                    changed = true;
                }
                else if (event.action === "update") {
                    const id = record.id;
                    const exists = this.cache.some((item) => item.id === id);
                    if (isMatch && !exists) {
                        // 原本不符合但現在符合了
                        this.cache = [...this.cache, record];
                        changed = true;
                    }
                    else if (isMatch && exists) {
                        // 依然符合，更新內容
                        this.cache = this.cache.map((item) => item.id === id ? record : item);
                        changed = true;
                    }
                    else if (!isMatch && exists) {
                        // 原本符合但現在不符合了，移除
                        this.cache = this.cache.filter((item) => item.id !== id);
                        changed = true;
                    }
                }
                else if (event.action === "delete" && wasMatch) {
                    const id = oldRecord.id;
                    this.cache = this.cache.filter((item) => item.id !== id);
                    changed = true;
                }
                // 如果快取發生變動，執行回呼
                if (changed) {
                    this.cache = this.applyWindow(this.cache);
                    callback(Object.assign(Object.assign({}, event), { record: this.cache, metadata: { fromCache: false, hasPendingWrites: isOptimistic } }));
                }
            };
            const serverSub = this.sdk.client.onDbEvent.subscribe({ lastTxid: this.lastTxid }, {
                onData: (event) => handleEvent(event, false),
                onError: (err) => {
                    console.error(`Subscription error for query ${this.tableName}:`, err);
                },
            });
            const localSub = this.sdk.localEvents.subscribe((event) => handleEvent(event, true));
            return () => {
                serverSub.unsubscribe();
                localSub();
            };
        });
    }
    valueChanges(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.onSnapshot(({ record }) => {
                callback(record);
            });
        });
    }
    subscribe(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.onSnapshot(callback);
        });
    }
    get() {
        return __awaiter(this, void 0, void 0, function* () {
            this.ensureQueryReady();
            const initialSort = this._limitToLast
                ? this.sortItems.map((item) => (Object.assign(Object.assign({}, item), { direction: item.direction === "asc" ? "desc" : "asc" })))
                : this.sortItems;
            const rows = yield this.sdk.client.data.list.query({
                tableName: this.tableName,
                schemaName: this.schemaName,
                where: this.filters,
                orderBy: initialSort,
                limit: this._limit,
                offset: this._offset,
            });
            const rowModels = this.toModels(rows);
            const normalizedRows = this._limitToLast ? rowModels.reverse() : rowModels;
            this.cache = this.applyWindow(normalizedRows);
            return this.cache;
        });
    }
    count() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.sdk.client.data.aggregate.query({
                tableName: this.tableName,
                schemaName: this.schemaName,
                where: this.filters,
                aggregations: [{ type: "count", alias: "count" }],
            });
            return Number(result.count);
        });
    }
    aggregate(spec) {
        return __awaiter(this, void 0, void 0, function* () {
            const aggregations = Object.entries(spec).map(([alias, s]) => ({
                type: s.type,
                field: s.field,
                alias,
            }));
            const result = yield this.sdk.client.data.aggregate.query({
                tableName: this.tableName,
                schemaName: this.schemaName,
                where: this.filters,
                aggregations,
            });
            // 將結果中的數值字串轉為 Number
            const finalResult = {};
            for (const [key, value] of Object.entries(result)) {
                finalResult[key] = value !== null ? Number(value) : null;
            }
            return finalResult;
        });
    }
}
exports.Query = Query;
/**
 * 聚合輔助函式 (Firestore-like)
 */
const count = () => ({ type: "count" });
exports.count = count;
const sum = (field) => ({ type: "sum", field });
exports.sum = sum;
const average = (field) => ({ type: "avg", field });
exports.average = average;
const minimum = (field) => ({ type: "min", field });
exports.minimum = minimum;
const maximum = (field) => ({ type: "max", field });
exports.maximum = maximum;
/**
 * Collection 繼承自 Query
 */
class Collection extends Query {
    constructor(tableName, sdk, schemaName = "public", converter = null) {
        super(tableName, sdk, schemaName);
        this.converter = converter;
    }
    withConverter(converter) {
        return new Collection(this.tableName, this.sdk, this.schemaName, converter);
    }
    add(record) {
        return __awaiter(this, void 0, void 0, function* () {
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
        });
    }
    doc(id, idField = "id") {
        return new Document(this.tableName, id, this.sdk, idField, this.schemaName, this.converter);
    }
}
exports.Collection = Collection;
class Document {
    constructor(tableName, id, sdk, idField = "id", schemaName = "public", converter = null) {
        this.tableName = tableName;
        this.id = id;
        this.sdk = sdk;
        this.idField = idField;
        this.schemaName = schemaName;
        this.converter = converter;
        this.cache = null;
        this.lastTxid = null;
    }
    withConverter(converter) {
        return new Document(this.tableName, this.id, this.sdk, this.idField, this.schemaName, converter);
    }
    toModel(data) {
        if (!this.converter)
            return data;
        return this.converter.fromFirestore(data);
    }
    toWire(model) {
        if (!this.converter || !this.converter.toFirestore)
            return model;
        return this.converter.toFirestore(model);
    }
    get() {
        return __awaiter(this, void 0, void 0, function* () {
            const row = yield this.sdk.client.data.get.query({
                tableName: this.tableName,
                schemaName: this.schemaName,
                id: this.id,
                idField: this.idField,
            });
            return row ? this.toModel(row) : null;
        });
    }
    exists() {
        return __awaiter(this, void 0, void 0, function* () {
            const row = yield this.get();
            return row !== null;
        });
    }
    onSnapshot(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const initialDoc = yield this.get();
                this.cache = initialDoc;
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
            }
            catch (err) {
                console.error(`Failed to fetch initial document for ${this.schemaName}.${this.tableName}/${this.id}:`, err);
            }
            const handleEvent = (event, isOptimistic = false) => {
                if (event.table !== this.tableName ||
                    (event.schema && event.schema !== this.schemaName))
                    return;
                if (event.txid && !isOptimistic)
                    this.lastTxid = event.txid;
                const currentRecord = this.toModel(event.record);
                const oldRecord = event.old_record;
                const matchesId = (currentRecord && currentRecord[this.idField] == this.id) ||
                    (oldRecord && oldRecord[this.idField] == this.id);
                if (matchesId) {
                    this.cache = event.action === "delete" ? null : currentRecord;
                    callback(Object.assign(Object.assign({}, event), { record: this.cache, metadata: { fromCache: false, hasPendingWrites: isOptimistic } }));
                }
            };
            const serverSub = this.sdk.client.onDbEvent.subscribe({ lastTxid: this.lastTxid }, {
                onData: (event) => handleEvent(event, false),
                onError: (err) => {
                    console.error(`Subscription error for document ${this.tableName}/${this.id}:`, err);
                },
            });
            const localSub = this.sdk.localEvents.subscribe((event) => handleEvent(event, true));
            return () => {
                serverSub.unsubscribe();
                localSub();
            };
        });
    }
    valueChanges(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.onSnapshot(({ record }) => {
                callback(record);
            });
        });
    }
    subscribe(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.onSnapshot(callback);
        });
    }
    update(record) {
        return __awaiter(this, void 0, void 0, function* () {
            const wireData = this.toWire(record);
            // 樂觀更新
            this.sdk.localEvents.publish({
                timestamp: new Date().toISOString(),
                txid: 0,
                action: "update",
                schema: this.schemaName,
                table: this.tableName,
                record: Object.assign(Object.assign({}, this.cache), wireData),
                old_record: this.cache,
                metadata: { fromCache: false, hasPendingWrites: true },
            });
            const updated = yield this.sdk.client.data.update.mutate({
                tableName: this.tableName,
                schemaName: this.schemaName,
                id: this.id,
                idField: this.idField,
                record: wireData,
            });
            return updated ? this.toModel(updated) : null;
        });
    }
    delete() {
        return __awaiter(this, void 0, void 0, function* () {
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
            const deleted = yield this.sdk.client.data.delete.mutate({
                tableName: this.tableName,
                schemaName: this.schemaName,
                id: this.id,
                idField: this.idField,
            });
            return deleted ? this.toModel(deleted) : null;
        });
    }
    set(record_1) {
        return __awaiter(this, arguments, void 0, function* (record, options = {}) {
            var _a;
            const wireData = this.toWire(record);
            // 樂觀更新
            this.sdk.localEvents.publish({
                timestamp: new Date().toISOString(),
                txid: 0,
                action: options.merge ? "update" : "insert",
                schema: this.schemaName,
                table: this.tableName,
                record: options.merge ? Object.assign(Object.assign({}, this.cache), wireData) : wireData,
                old_record: this.cache,
                metadata: { fromCache: false, hasPendingWrites: true },
            });
            const setRow = yield this.sdk.client.data.set.mutate({
                tableName: this.tableName,
                schemaName: this.schemaName,
                id: this.id,
                idField: this.idField,
                record: wireData,
                merge: (_a = options.merge) !== null && _a !== void 0 ? _a : false,
            });
            return setRow ? this.toModel(setRow) : null;
        });
    }
}
exports.Document = Document;
/**
 * WriteBatch - 批量寫入支援
 */
class WriteBatch {
    constructor(sdk) {
        this.sdk = sdk;
        this.operations = [];
    }
    set(doc, record, options = {}) {
        var _a;
        this.operations.push({
            type: "set",
            tableName: doc.tableName,
            schemaName: doc.schemaName,
            id: doc.id,
            idField: doc.idField,
            record,
            merge: (_a = options.merge) !== null && _a !== void 0 ? _a : false,
        });
        return this;
    }
    update(doc, record) {
        this.operations.push({
            type: "update",
            tableName: doc.tableName,
            schemaName: doc.schemaName,
            id: doc.id,
            idField: doc.idField,
            record,
        });
        return this;
    }
    delete(doc) {
        this.operations.push({
            type: "delete",
            tableName: doc.tableName,
            schemaName: doc.schemaName,
            id: doc.id,
            idField: doc.idField,
        });
        return this;
    }
    commit() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.operations.length === 0)
                return;
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
            yield this.sdk.client.data.batch.mutate({ operations: this.operations });
            this.operations = [];
        });
    }
}
exports.WriteBatch = WriteBatch;
/**
 * Transaction - 支援「讀取後寫入」的樂觀鎖交易
 */
class Transaction extends WriteBatch {
    constructor(sdk) {
        super(sdk);
        this.preconditions = new Map();
    }
    get(doc) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield doc.get();
            if (data) {
                // 建立樂觀鎖前置條件 (基於目前讀取到的欄位值)
                // 在工業實作中，通常會基於 version 或 updated_at 欄位
                // 這裡採用全欄位比對以實現「Zero Config」樂觀鎖
                const filters = Object.entries(data)
                    .filter(([key, val]) => val !== null && typeof val !== "object") // 僅比對基礎型別
                    .map(([key, value]) => ({ field: key, operator: "==", value }));
                this.preconditions.set(this.getDocKey(doc), filters);
            }
            return data;
        });
    }
    getDocKey(doc) {
        return `${doc.schemaName}.${doc.tableName}.${doc.id}`;
    }
    set(doc, record, options = {}) {
        super.set(doc, record, options);
        const filters = this.preconditions.get(this.getDocKey(doc));
        if (filters) {
            this.operations[this.operations.length - 1].where = filters;
        }
        return this;
    }
    update(doc, record) {
        super.update(doc, record);
        const filters = this.preconditions.get(this.getDocKey(doc));
        if (filters) {
            this.operations[this.operations.length - 1].where = filters;
        }
        return this;
    }
    delete(doc) {
        super.delete(doc);
        const filters = this.preconditions.get(this.getDocKey(doc));
        if (filters) {
            this.operations[this.operations.length - 1].where = filters;
        }
        return this;
    }
}
exports.Transaction = Transaction;
class VanillaFirestore {
    constructor(url) {
        this.url = url;
        this.userId = null;
        this._localEvents = new LocalEventBus();
        this.initTrpc();
    }
    get localEvents() {
        return this._localEvents;
    }
    initTrpc() {
        const baseUrl = this.url.endsWith("/") ? this.url : `${this.url}/`;
        const wsUrl = `${this.url.includes("https") ? "wss" : "ws"}://${this.url.split("//")[1].split("/")[0]}/trpc${this.userId ? `?token=${this.userId}` : ""}`;
        this.trpc = (0, client_1.createTRPCProxyClient)({
            links: [
                (0, client_1.splitLink)({
                    condition(op) {
                        return op.type === "subscription";
                    },
                    true: this.getEndingLink(wsUrl),
                    false: (0, client_1.httpBatchLink)({
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
    getEndingLink(wsUrl) {
        if (typeof window === "undefined") {
            return (0, client_1.httpBatchLink)({
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
        const client = (0, client_2.createWSClient)({
            url: wsUrl,
        });
        return (0, client_1.wsLink)({
            client,
        });
    }
    auth(userId) {
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
    runTransaction(updateFunction_1) {
        return __awaiter(this, arguments, void 0, function* (updateFunction, maxRetries = 5) {
            var _a;
            let retries = 0;
            while (true) {
                const transaction = new Transaction(this);
                try {
                    const result = yield updateFunction(transaction);
                    yield transaction.commit();
                    return result;
                }
                catch (error) {
                    const isConflict = (_a = error.message) === null || _a === void 0 ? void 0 : _a.includes("Precondition mismatch");
                    if (isConflict && retries < maxRetries) {
                        retries++;
                        console.warn(`🔄 Transaction conflict detected, retrying... (${retries}/${maxRetries})`);
                        // 指數避退增加成功率
                        yield new Promise((res) => setTimeout(res, Math.random() * 100 * retries));
                        continue;
                    }
                    throw error;
                }
            }
        });
    }
    collection(name, schema = "public") {
        return new Collection(name, this, schema);
    }
    doc(name, id, idField = "id", schema = "public") {
        return new Document(name, id, this, idField, schema);
    }
    get client() {
        return this.trpc;
    }
}
exports.VanillaFirestore = VanillaFirestore;
function createSdk(url) {
    return new VanillaFirestore(url);
}
