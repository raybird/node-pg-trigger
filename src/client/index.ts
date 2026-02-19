import { createTRPCProxyClient, httpBatchLink, wsLink, splitLink } from '@trpc/client';
import { createWSClient } from '@trpc/client';
import type { AppRouter } from '../server/router';

export type DbEvent<T = any> = {
  timestamp: string;
  txid: number;
  action: 'insert' | 'update' | 'delete' | 'initial';
  schema: string;
  table: string;
  record: T | T[];
  old_record: T | null;
};

export class Collection<T = any> {
  private cache: T[] = [];

  constructor(private tableName: string, private sdk: any) {}

  get data() {
    return this.cache;
  }

  async onSnapshot(callback: (snapshot: DbEvent<T[]>) => void) {
    try {
      const initialData = await this.sdk.data.list.query({ tableName: this.tableName });
      this.cache = initialData;
      
      callback({
        timestamp: new Date().toISOString(),
        txid: 0,
        action: 'initial',
        schema: 'public',
        table: this.tableName,
        record: this.cache,
        old_record: null
      });
    } catch (err) {
      console.error(`Failed to fetch initial snapshot for ${this.tableName}:`, err);
    }

    const subscription = this.sdk.onDbEvent.subscribe(undefined, {
      onData: (event: DbEvent<T>) => {
        if (event.table !== this.tableName) return;

        if (event.action === 'insert') {
          this.cache = [...this.cache, event.record as T];
        } else if (event.action === 'update') {
          const id = (event.record as any).id;
          this.cache = this.cache.map(item => (item as any).id === id ? event.record as T : item);
        } else if (event.action === 'delete') {
          const id = (event.old_record as any).id;
          this.cache = this.cache.filter(item => (item as any).id !== id);
        }

        callback({
          ...event,
          record: this.cache
        } as DbEvent<T[]>);
      },
      onError: (err: any) => {
        console.error(`Subscription error for collection ${this.tableName}:`, err);
      },
    });

    return () => subscription.unsubscribe();
  }

  async add(record: Partial<T>): Promise<T> {
    return this.sdk.data.add.mutate({ tableName: this.tableName, record });
  }
}

export class Document<T = any> {
  private cache: T | null = null;

  constructor(
    private tableName: string,
    private id: string | number,
    private sdk: any,
    private idField: string = 'id'
  ) {}

  async get(): Promise<T | null> {
    return this.sdk.data.get.query({ 
      tableName: this.tableName, 
      id: this.id, 
      idField: this.idField 
    });
  }

  async onSnapshot(callback: (snapshot: DbEvent<T | null>) => void) {
    try {
      const initialDoc = await this.get();
      this.cache = initialDoc;
      
      callback({
        timestamp: new Date().toISOString(),
        txid: 0,
        action: 'initial',
        schema: 'public',
        table: this.tableName,
        record: this.cache,
        old_record: null
      });
    } catch (err) {
      console.error(`Failed to fetch initial document for ${this.tableName}/${this.id}:`, err);
    }

    const subscription = this.sdk.onDbEvent.subscribe(undefined, {
      onData: (event: DbEvent<T>) => {
        if (event.table !== this.tableName) return;
        
        const currentRecord = event.record as any;
        const oldRecord = event.old_record as any;
        
        const matchesId = (currentRecord && currentRecord[this.idField] == this.id) || 
                          (oldRecord && oldRecord[this.idField] == this.id);

        if (matchesId) {
          this.cache = event.action === 'delete' ? null : currentRecord;
          callback({
            ...event,
            record: this.cache
          });
        }
      },
      onError: (err: any) => {
        console.error(`Subscription error for document ${this.tableName}/${this.id}:`, err);
      },
    });

    return () => subscription.unsubscribe();
  }

  async update(record: Partial<T>): Promise<T | null> {
    return this.sdk.data.update.mutate({ 
      tableName: this.tableName, 
      id: this.id, 
      idField: this.idField, 
      record 
    });
  }

  async delete(): Promise<T | null> {
    return this.sdk.data.delete.mutate({ 
      tableName: this.tableName, 
      id: this.id, 
      idField: this.idField 
    });
  }
}

export class VanillaFirestore {
  private trpc: any;
  private userId: string | null = null;

  constructor(private url: string) {
    this.initTrpc();
  }

  private initTrpc() {
    const wsUrl = `${this.url.includes('https') ? 'wss' : 'ws'}://${this.url.split('//')[1]}`;
    this.trpc = createTRPCProxyClient<AppRouter>({
      links: [
        splitLink({
          condition(op) {
            return op.type === 'subscription';
          },
          true: this.getEndingLink(wsUrl),
          false: httpBatchLink({
            url: this.url.endsWith('/') ? `${this.url}trpc` : `${this.url}/trpc`,
            headers: () => {
              return this.userId ? {
                Authorization: `Bearer ${this.userId}`,
              } : {};
            }
          }),
        }),
      ],
    });
  }

  private getEndingLink(wsUrl: string) {
    if (typeof window === 'undefined') {
      return httpBatchLink({
        url: this.url.endsWith('/') ? `${this.url}trpc` : `${this.url}/trpc`,
        headers: () => {
          return this.userId ? {
            Authorization: `Bearer ${this.userId}`,
          } : {};
        }
      });
    }
    const client = createWSClient({
      url: wsUrl,
      // 注意：WS 的認證通常需要透過 query params 或特定的協定處理
      // 這裡先簡化處理，主要展示 HTTP 的 RLS 連動
    });
    return wsLink<AppRouter>({
      client,
    });
  }

  /**
   * 模擬登入
   */
  auth(userId: string) {
    this.userId = userId;
    // 重新初始化 trpc 以套用新的 headers (或確保 headers() 函式被正確調用)
    this.initTrpc();
    return this;
  }

  /**
   * 登出
   */
  signOut() {
    this.userId = null;
    this.initTrpc();
    return this;
  }

  collection<T = any>(name: string) {
    return new Collection<T>(name, this.trpc);
  }

  doc<T = any>(name: string, id: string | number, idField: string = 'id') {
    return new Document<T>(name, id, this.trpc, idField);
  }

  get client() {
    return this.trpc;
  }
}

export function createSdk(url: string) {
  return new VanillaFirestore(url);
}
