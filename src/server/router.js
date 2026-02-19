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
exports.appRouter = void 0;
const trpc_1 = require("./trpc");
const trigger_1 = require("./procedures/trigger");
const data_1 = require("./procedures/data");
const observable_1 = require("@trpc/server/observable");
const db_1 = require("./lib/db");
const event_bus_1 = require("./lib/event-bus");
const zod_1 = require("zod");
exports.appRouter = (0, trpc_1.router)({
    /**
     * 掛載 trigger 相關的程序
     */
    trigger: trigger_1.triggerRouter,
    /**
     * 掛載 data 相關的程序 (用於獲取初始快照)
     */
    data: data_1.dataRouter,
    /**
     * Subscription: 訂閱資料庫事件 (支援斷線追補)
     */
    onDbEvent: trpc_1.procedure
        .input(zod_1.z.object({
        lastTxid: zod_1.z.string().optional().or(zod_1.z.number().optional()),
    }).optional())
        .subscription(({ ctx, input }) => {
        return (0, observable_1.observable)((emit) => {
            const lastTxid = (input === null || input === void 0 ? void 0 : input.lastTxid) ? BigInt(input.lastTxid) : null;
            const handleNotification = (payload) => __awaiter(void 0, void 0, void 0, function* () {
                // RLS 安全過濾
                if (ctx.user) {
                    const targetRecord = payload.action === 'delete' ? payload.old_record : payload.record;
                    if (targetRecord) {
                        const hasAccess = yield db_1.db.checkRls(ctx.user.id, payload.table, targetRecord);
                        if (!hasAccess)
                            return;
                    }
                }
                emit.next(payload);
            });
            // 啟動追補與訂閱邏輯
            const startSubscription = () => __awaiter(void 0, void 0, void 0, function* () {
                if (lastTxid !== null) {
                    console.log(`📡 Re-syncing events since txid: ${lastTxid}`);
                    try {
                        const sql = `
                SELECT 
                  timestamp, txid, action, schema_name as schema, table_name as "table", record, old_record 
                FROM public.audit_log 
                WHERE txid > $1 
                ORDER BY txid ASC 
                LIMIT 1000;
              `;
                        const result = yield db_1.db.query(sql, [lastTxid.toString()]);
                        for (const row of result.rows) {
                            yield handleNotification(row);
                        }
                        console.log(`✅ Re-synced ${result.rows.length} events.`);
                    }
                    catch (err) {
                        console.error('[Re-sync Error]', err);
                    }
                }
                // 向全域事件總線訂閱
                const unsubscribe = event_bus_1.eventBus.subscribe(handleNotification);
                return unsubscribe;
            });
            const subscriptionPromise = startSubscription();
            return () => {
                subscriptionPromise.then(unsubscribe => unsubscribe && unsubscribe());
            };
        });
    }),
});
