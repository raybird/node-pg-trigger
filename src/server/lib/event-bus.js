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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventBus = exports.EventBus = void 0;
const events_1 = require("events");
const ioredis_1 = __importDefault(require("ioredis"));
/**
 * EventBus - 系統內部的事件中心
 *
 * 已升級：支援 Redis Pub/Sub 以實現多節點水平擴展。
 * 若環境變數中未提供 REDIS_URL，則自動降級為本地 EventEmitter 模式。
 */
class EventBus extends events_1.EventEmitter {
    constructor() {
        super();
        this.redisPub = null;
        this.redisSub = null;
        this.channel = 'db_events_channel';
        const redisUrl = process.env.REDIS_URL;
        if (redisUrl) {
            console.log('[EventBus] Redis URL detected, enabling distributed mode...');
            this.redisPub = new ioredis_1.default(redisUrl);
            this.redisSub = new ioredis_1.default(redisUrl);
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
                    }
                    catch (e) {
                        console.error('[EventBus] Failed to parse Redis message:', e);
                    }
                }
            });
        }
        else {
            console.log('[EventBus] No Redis URL found, using local memory mode.');
        }
    }
    /**
     * 發布異動事件
     */
    publish(payload) {
        if (this.redisPub) {
            this.redisPub.publish(this.channel, JSON.stringify(payload));
        }
        else {
            this.emit('db_event', payload);
        }
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
    /**
     * 關閉連線
     */
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.redisPub)
                yield this.redisPub.quit();
            if (this.redisSub)
                yield this.redisSub.quit();
        });
    }
}
exports.EventBus = EventBus;
exports.eventBus = new EventBus();
