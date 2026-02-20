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
exports.IndexedDBPersistence = void 0;
class IndexedDBPersistence {
    constructor() {
        this.dbName = "vanilla-firestore-cache";
        this.storeName = "documents";
        this.dbPromise = this.openDB();
    }
    openDB() {
        return new Promise((resolve, reject) => {
            if (typeof window === "undefined" || !window.indexedDB) {
                return reject(new Error("IndexedDB not supported"));
            }
            const request = window.indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            request.onsuccess = (event) => {
                resolve(event.target.result);
            };
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }
    get(key) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const db = yield this.dbPromise;
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction(this.storeName, "readonly");
                    const store = transaction.objectStore(this.storeName);
                    const request = store.get(key);
                    request.onsuccess = () => resolve(request.result || null);
                    request.onerror = () => reject(request.error);
                });
            }
            catch (e) {
                return null;
            }
        });
    }
    set(key, value) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const db = yield this.dbPromise;
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction(this.storeName, "readwrite");
                    const store = transaction.objectStore(this.storeName);
                    const request = store.put(value, key);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }
            catch (e) {
                // Ignore errors in non-browser env
            }
        });
    }
    remove(key) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const db = yield this.dbPromise;
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction(this.storeName, "readwrite");
                    const store = transaction.objectStore(this.storeName);
                    const request = store.delete(key);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }
            catch (e) {
                // Ignore
            }
        });
    }
    clear() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const db = yield this.dbPromise;
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction(this.storeName, "readwrite");
                    const store = transaction.objectStore(this.storeName);
                    const request = store.clear();
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }
            catch (e) {
                // Ignore
            }
        });
    }
}
exports.IndexedDBPersistence = IndexedDBPersistence;
