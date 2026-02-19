"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventBus = exports.EventBus = void 0;
const events_1 = require("events");
/**
 * EventBus - 系統內部的事件中心
 * 負責將資料庫異動事件分發給所有的訂閱者 (如 WebSocket 連線)。
 *
 * 未來可輕鬆抽換為 Redis Pub/Sub 實作以支援多節點擴展。
 */
class EventBus extends events_1.EventEmitter {
    /**
     * 發布異動事件
     */
    publish(payload) {
        this.emit('db_event', payload);
    }
    /**
     * 訂閱異動事件
     */
    subscribe(callback) {
        this.on('db_event', callback);
        return () => {
            this.off('db_event', callback);
        };
    }
}
exports.EventBus = EventBus;
exports.eventBus = new EventBus();
