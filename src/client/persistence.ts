export interface PersistenceProvider {
  get(key: string): Promise<any | null>;
  set(key: string, value: any): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

export class IndexedDBPersistence implements PersistenceProvider {
  private dbName = "vanilla-firestore-cache";
  private storeName = "documents";
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = this.openDB();
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        return reject(new Error("IndexedDB not supported"));
      }

      const request = window.indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  async get(key: string): Promise<any | null> {
    try {
      const db = await this.dbPromise;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readonly");
        const store = transaction.objectStore(this.storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      return null;
    }
  }

  async set(key: string, value: any): Promise<void> {
    try {
      const db = await this.dbPromise;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);
        const request = store.put(value, key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      // Ignore errors in non-browser env
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const db = await this.dbPromise;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      // Ignore
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.dbPromise;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      // Ignore
    }
  }
}
