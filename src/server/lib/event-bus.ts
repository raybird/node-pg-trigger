import { EventEmitter } from 'events';
import Redis from 'ioredis';

/**
 * EventBus - 系統內部的事件中心
 * 
 * 已升級：支援 Redis Pub/Sub 以實現多節點水平擴展。
 * 若環境變數中未提供 REDIS_URL，則自動降級為本地 EventEmitter 模式。
 */
export class EventBus extends EventEmitter {
  private redisPub: Redis | null = null;
  private redisSub: Redis | null = null;
  private readonly channel = 'db_events_channel';

  constructor() {
    super();
    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
      console.log('[EventBus] Redis URL detected, enabling distributed mode...');
      this.redisPub = new Redis(redisUrl);
      this.redisSub = new Redis(redisUrl);

      this.redisSub.subscribe(this.channel, (err) => {
        if (err) {
          console.error('[EventBus] Redis subscribe error:', err);
        }
      });

      this.redisSub.on('message', (channel, message) => {
        if (channel === this.channel) {
          try {
            const payload = JSON.parse(message);
            // 觸發本地監聽器
            super.emit('db_event', payload);
          } catch (e) {
            console.error('[EventBus] Failed to parse Redis message:', e);
          }
        }
      });
    } else {
      console.log('[EventBus] No Redis URL found, using local memory mode.');
    }
  }

  /**
   * 發布異動事件
   */
  public publish(payload: any) {
    if (this.redisPub) {
      this.redisPub.publish(this.channel, JSON.stringify(payload));
    } else {
      this.emit('db_event', payload);
    }
  }

  /**
   * 訂閱異動事件
   */
  public subscribe(callback: (payload: any) => void) {
    this.on('db_event', callback);
    return () => {
      this.off('db_event', callback);
    };
  }

  /**
   * 關閉連線
   */
  public async close() {
    if (this.redisPub) await this.redisPub.quit();
    if (this.redisSub) await this.redisSub.quit();
  }
}

export const eventBus = new EventBus();
