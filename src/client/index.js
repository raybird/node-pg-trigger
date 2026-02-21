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
exports.VanillaFirestore = exports.Document = exports.Collection = exports.Query = exports.FieldValue = void 0;
exports.createSdk = createSdk;
const client_1 = require("@trpc/client");
const client_2 = require("@trpc/client");
const persistence_1 = require("./persistence");
const uuid_1 = require("uuid");
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
        this._include = null;
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
    /**
     * include - 展開關聯資料 (伺服器端 JOIN)
     */
    include(nameOrSpec, config) {
        if (typeof nameOrSpec === "string") {
            if (!this._include)
                this._include = {};
            this._include[nameOrSpec] = config;
        }
        else {
            this._include = Object.assign(Object.assign({}, (this._include || {})), nameOrSpec);
        }
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
        next._include = this._include ? Object.assign({}, this._include) : null;
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
    getStorageKey() {
        const filterStr = JSON.stringify(this.filters);
        const sortStr = JSON.stringify(this.sortItems);
        const incStr = JSON.stringify(this._include);
        return `query:${this.schemaName}.${this.tableName}:${filterStr}:${sortStr}:${incStr}:${this._limit}:${this._offset}`;
    }
    matchesFilters(record) {
        if (!record)
            return false;
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
    ensureQueryReady() {
        if (this._limitToLast && this.sortItems.length === 0) {
            throw new Error("limitToLast() 需要至少一個 orderBy()。");
        }
        if ((this._startCursor || this._endCursor) && this.sortItems.length === 0) {
            throw new Error("Cursor 分頁需要至少一個 orderBy()。");
        }
    }
    applyWindow(records) {
        const sorted = [...records].sort((left, right) => {
            for (const sort of this.sortItems) {
                const valL = left === null || left === void 0 ? void 0 : left[sort.field];
                const valR = right === null || right === void 0 ? void 0 : right[sort.field];
                if (valL === valR)
                    continue;
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
    patchRelations(record) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._include || !record)
                return record;
            const full = yield this.sdk.doc(this.tableName, record.id, "id", this.schemaName)
                .include(this._include)
                .get();
            return full || record;
        });
    }
    onSnapshot(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            this.ensureQueryReady();
            if (this.sdk.persistence) {
                try {
                    const cached = yield this.sdk.persistence.get(this.getStorageKey());
                    if (cached && Array.isArray(cached)) {
                        this.cache = cached;
                        callback({
                            timestamp: new Date().toISOString(), txid: 0, action: "initial",
                            schema: this.schemaName, table: this.tableName, record: this.cache,
                            old_record: null, metadata: { fromCache: true, hasPendingWrites: false },
                        });
                    }
                }
                catch (err) { }
            }
            try {
                const initialData = yield this.sdk.client.data.list.query({
                    tableName: this.tableName, schemaName: this.schemaName,
                    where: this.filters, orderBy: this.sortItems,
                    limit: this._limit, offset: this._offset, include: this._include || undefined
                });
                this.cache = this.toModels(initialData);
                callback({
                    timestamp: new Date().toISOString(), txid: 0, action: "initial",
                    schema: this.schemaName, table: this.tableName, record: this.cache,
                    old_record: null, metadata: { fromCache: false, hasPendingWrites: false },
                });
            }
            catch (err) { }
            const handleEvent = (event_1, ...args_1) => __awaiter(this, [event_1, ...args_1], void 0, function* (event, isOptimistic = false) {
                var _a;
                if (event.table !== this.tableName || (event.schema && event.schema !== this.schemaName))
                    return;
                if (event.txid && !isOptimistic)
                    this.lastTxid = event.txid;
                let record = this.toModel(event.record);
                const isMatch = this.matchesFilters(record);
                let changed = false;
                // 簡化維護邏輯
                if (event.action === "insert" && isMatch) {
                    if (this._include && !isOptimistic)
                        record = yield this.patchRelations(record);
                    this.cache = [...this.cache, record];
                    changed = true;
                }
                else if (event.action === "update") {
                    const id = record.id;
                    const exists = this.cache.some((item) => item.id === id);
                    if (isMatch) {
                        if (this._include && !isOptimistic)
                            record = yield this.patchRelations(record);
                        this.cache = exists ? this.cache.map((i) => i.id === id ? record : i) : [...this.cache, record];
                        changed = true;
                    }
                    else if (exists) {
                        this.cache = this.cache.filter((i) => i.id !== id);
                        changed = true;
                    }
                }
                else if (event.action === "delete") {
                    const id = (_a = event.old_record) === null || _a === void 0 ? void 0 : _a.id;
                    if (this.cache.some((i) => i.id === id)) {
                        this.cache = this.cache.filter((i) => i.id !== id);
                        changed = true;
                    }
                }
                if (changed) {
                    this.cache = this.applyWindow(this.cache);
                    if (!isOptimistic && this.sdk.persistence) {
                        this.sdk.persistence.set(this.getStorageKey(), this.cache).catch(() => { });
                    }
                    callback(Object.assign(Object.assign({}, event), { record: this.cache, metadata: { fromCache: false, hasPendingWrites: isOptimistic } }));
                }
            });
            const serverSub = this.sdk.client.onDbEvent.subscribe({ lastTxid: this.lastTxid }, {
                onData: (event) => handleEvent(event, false),
            });
            const localSub = this.sdk.localEvents.subscribe((event) => handleEvent(event, true));
            return () => { serverSub.unsubscribe(); localSub(); };
        });
    }
    get() {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield this.sdk.client.data.list.query({
                tableName: this.tableName, schemaName: this.schemaName,
                where: this.filters, orderBy: this.sortItems,
                limit: this._limit, offset: this._offset, include: this._include || undefined
            });
            return this.toModels(data);
        });
    }
    count() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.sdk.client.data.aggregate.query({
                tableName: this.tableName, schemaName: this.schemaName, where: this.filters,
                aggregations: [{ type: "count", alias: "count" }],
            });
            return Number(result.count);
        });
    }
}
exports.Query = Query;
/**
 * Collection 類別
 */
class Collection extends Query {
    constructor(tableName, sdk, schemaName = "public", converter = null) {
        super(tableName, sdk, schemaName);
        this.converter = converter;
    }
    get id() { return this.tableName; }
    get path() { return `${this.schemaName}/${this.tableName}`; }
    add(record) {
        return __awaiter(this, void 0, void 0, function* () {
            const wireData = this.toWire(record);
            const result = yield this.sdk.client.data.add.mutate({ tableName: this.tableName, schemaName: this.schemaName, record: wireData });
            return this.doc(result.id);
        });
    }
    doc(id, idField = "id") {
        const finalId = id !== null && id !== void 0 ? id : (0, uuid_1.v4)();
        return new Document(this.tableName, finalId, this.sdk, idField, this.schemaName, this.converter);
    }
}
exports.Collection = Collection;
/**
 * Document 類別
 */
class Document {
    constructor(tableName, _id, sdk, idField = "id", schemaName = "public", converter = null) {
        this.tableName = tableName;
        this._id = _id;
        this.sdk = sdk;
        this.idField = idField;
        this.schemaName = schemaName;
        this.converter = converter;
        this.cache = null;
        this._include = null;
    }
    get id() { return this._id; }
    get path() { return `${this.schemaName}/${this.tableName}/${this._id}`; }
    include(nameOrSpec, config) {
        if (typeof nameOrSpec === "string") {
            if (!this._include)
                this._include = {};
            this._include[nameOrSpec] = config;
        }
        else {
            this._include = Object.assign(Object.assign({}, (this._include || {})), nameOrSpec);
        }
        return this;
    }
    get() {
        return __awaiter(this, void 0, void 0, function* () {
            const row = yield this.sdk.client.data.get.query({
                tableName: this.tableName, schemaName: this.schemaName,
                id: this._id, idField: this.idField, include: this._include || undefined
            });
            return row ? (this.converter ? this.converter.fromFirestore(row) : row) : null;
        });
    }
    update(record) {
        return __awaiter(this, void 0, void 0, function* () {
            const updated = yield this.sdk.client.data.update.mutate({
                tableName: this.tableName, schemaName: this.schemaName,
                id: this._id, idField: this.idField, record
            });
            return updated;
        });
    }
    delete() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.sdk.client.data.delete.mutate({ tableName: this.tableName, schemaName: this.schemaName, id: this._id, idField: this.idField });
        });
    }
}
exports.Document = Document;
class VanillaFirestore {
    constructor(url) {
        this.url = url;
        this.userId = null;
        this._localEvents = new LocalEventBus();
        this._persistence = null;
        this.initTrpc();
    }
    get localEvents() { return this._localEvents; }
    get persistence() { return this._persistence; }
    enablePersistence() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._persistence)
                this._persistence = new persistence_1.IndexedDBPersistence();
        });
    }
    initTrpc() {
        const baseUrl = this.url.endsWith("/") ? this.url : `${this.url}/`;
        this.trpc = (0, client_1.createTRPCProxyClient)({
            links: [
                (0, client_1.splitLink)({
                    condition: (op) => op.type === "subscription",
                    true: (0, client_1.wsLink)({ client: (0, client_2.createWSClient)({ url: `${this.url.replace("http", "ws")}/trpc` }) }),
                    false: (0, client_1.httpBatchLink)({ url: `${baseUrl}trpc` }),
                }),
            ],
        });
    }
    collection(name, schema = "public") { return new Collection(name, this, schema); }
    doc(name, id, idField = "id", schema = "public") { return new Document(name, id, this, idField, schema); }
    get client() { return this.trpc; }
}
exports.VanillaFirestore = VanillaFirestore;
function createSdk(url) { return new VanillaFirestore(url); }
