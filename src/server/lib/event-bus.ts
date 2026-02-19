import { EventEmitter } from 'events';

/**
 * EventBus - 系統內部的事件中心
 * 負責將資料庫異動事件分發給所有的訂閱者 (如 WebSocket 連線)。
 * 
 * 未來可輕鬆抽換為 Redis Pub/Sub 實作以支援多節點擴展。
 */
export class EventBus extends EventEmitter {
  /**
   * 發布異動事件
   */
  public publish(payload: any) {
    this.emit('db_event', payload);
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
}

export const eventBus = new EventBus();
