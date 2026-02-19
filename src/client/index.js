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
exports.VanillaFirestore = exports.WriteBatch = exports.Document = exports.Collection = exports.Query = exports.FieldValue = void 0;
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
        this.lastTxid = null;
        this.cache = [];
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
        return this;
    }
    offset(n) {
        this._offset = n;
        return this;
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
    onSnapshot(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            // 1. 獲取初始快照 (帶過濾)
            try {
                const initialData = yield this.sdk.data.list.query({
                    tableName: this.tableName,
                    schemaName: this.schemaName,
                    where: this.filters,
                    orderBy: this.sortItems,
                    limit: this._limit,
                    offset: this._offset,
                });
                this.cache = initialData;
                callback({
                    timestamp: new Date().toISOString(),
                    txid: 0,
                    action: "initial",
                    schema: this.schemaName,
                    table: this.tableName,
                    record: this.cache,
                    old_record: null,
                });
            }
            catch (err) {
                console.error(`Failed to fetch snapshot for ${this.schemaName}.${this.tableName}:`, err);
            }
            // 2. 訂閱變更並自動維護快取 (含過濾邏輯)
            const subscription = this.sdk.onDbEvent.subscribe({ lastTxid: this.lastTxid }, {
                onData: (event) => {
                    if (event.table !== this.tableName ||
                        (event.schema && event.schema !== this.schemaName))
                        return;
                    if (event.txid)
                        this.lastTxid = event.txid;
                    const record = event.record;
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
                        // 這裡可以再執行一次客戶端排序以確保順序正確
                        callback(Object.assign(Object.assign({}, event), { record: this.cache }));
                    }
                },
                onError: (err) => {
                    console.error(`Subscription error for query ${this.tableName}:`, err);
                },
            });
            return () => subscription.unsubscribe();
        });
    }
    get() {
        return __awaiter(this, void 0, void 0, function* () {
            const rows = yield this.sdk.data.list.query({
                tableName: this.tableName,
                schemaName: this.schemaName,
                where: this.filters,
                orderBy: this.sortItems,
                limit: this._limit,
                offset: this._offset,
            });
            this.cache = rows;
            return rows;
        });
    }
}
exports.Query = Query;
/**
 * Collection 繼承自 Query
 */
class Collection extends Query {
    constructor(tableName, sdk, schemaName = "public") {
        super(tableName, sdk, schemaName);
    }
    add(record) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.sdk.data.add.mutate({
                tableName: this.tableName,
                schemaName: this.schemaName,
                record,
            });
        });
    }
    doc(id, idField = "id") {
        return new Document(this.tableName, id, this.sdk, idField, this.schemaName);
    }
}
exports.Collection = Collection;
class Document {
    constructor(tableName, id, sdk, idField = "id", schemaName = "public") {
        this.tableName = tableName;
        this.id = id;
        this.sdk = sdk;
        this.idField = idField;
        this.schemaName = schemaName;
        this.cache = null;
        this.lastTxid = null;
    }
    get() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.sdk.data.get.query({
                tableName: this.tableName,
                schemaName: this.schemaName,
                id: this.id,
                idField: this.idField,
            });
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
                });
            }
            catch (err) {
                console.error(`Failed to fetch initial document for ${this.schemaName}.${this.tableName}/${this.id}:`, err);
            }
            const subscription = this.sdk.onDbEvent.subscribe({ lastTxid: this.lastTxid }, {
                onData: (event) => {
                    if (event.table !== this.tableName ||
                        (event.schema && event.schema !== this.schemaName))
                        return;
                    if (event.txid)
                        this.lastTxid = event.txid;
                    const currentRecord = event.record;
                    const oldRecord = event.old_record;
                    const matchesId = (currentRecord && currentRecord[this.idField] == this.id) ||
                        (oldRecord && oldRecord[this.idField] == this.id);
                    if (matchesId) {
                        this.cache = event.action === "delete" ? null : currentRecord;
                        callback(Object.assign(Object.assign({}, event), { record: this.cache }));
                    }
                },
                onError: (err) => {
                    console.error(`Subscription error for document ${this.tableName}/${this.id}:`, err);
                },
            });
            return () => subscription.unsubscribe();
        });
    }
    update(record) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.sdk.data.update.mutate({
                tableName: this.tableName,
                schemaName: this.schemaName,
                id: this.id,
                idField: this.idField,
                record,
            });
        });
    }
    delete() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.sdk.data.delete.mutate({
                tableName: this.tableName,
                schemaName: this.schemaName,
                id: this.id,
                idField: this.idField,
            });
        });
    }
    set(record_1) {
        return __awaiter(this, arguments, void 0, function* (record, options = {}) {
            var _a;
            return this.sdk.data.set.mutate({
                tableName: this.tableName,
                schemaName: this.schemaName,
                id: this.id,
                idField: this.idField,
                record,
                merge: (_a = options.merge) !== null && _a !== void 0 ? _a : false,
            });
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
            yield this.sdk.data.batch.mutate({ operations: this.operations });
            this.operations = [];
        });
    }
}
exports.WriteBatch = WriteBatch;
class VanillaFirestore {
    constructor(url) {
        this.url = url;
        this.userId = null;
        this.initTrpc();
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
        return new WriteBatch(this.trpc);
    }
    collection(name, schema = "public") {
        return new Collection(name, this.trpc, schema);
    }
    doc(name, id, idField = "id", schema = "public") {
        return new Document(name, id, this.trpc, idField, schema);
    }
    get client() {
        return this.trpc;
    }
}
exports.VanillaFirestore = VanillaFirestore;
function createSdk(url) {
    return new VanillaFirestore(url);
}
