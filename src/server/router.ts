import { router, procedure } from './trpc';
import { triggerRouter } from './procedures/trigger';
import { dataRouter } from './procedures/data';
import { observable } from '@trpc/server/observable';
import { dbNotificationListener } from './lib/listener';
import { db } from './lib/db';
import { eventBus } from './lib/event-bus';
import { z } from 'zod';

export const appRouter = router({
  /**
   * 掛載 trigger 相關的程序
   */
  trigger: triggerRouter,

  /**
   * 掛載 data 相關的程序 (用於獲取初始快照)
   */
  data: dataRouter,

  /**
   * Subscription: 訂閱資料庫事件 (支援斷線追補)
   */
  onDbEvent: procedure
    .input(z.object({
      lastTxid: z.string().optional().or(z.number().optional()),
    }).optional())
    .subscription(({ ctx, input }) => {
      return observable<any>((emit) => {
        const lastTxid = input?.lastTxid ? BigInt(input.lastTxid) : null;

        const handleNotification = async (payload: any) => {
          // RLS 安全過濾
          if (ctx.user) {
            const targetRecord = payload.action === 'delete' ? payload.old_record : payload.record;
            if (targetRecord) {
              const hasAccess = await db.checkRls(ctx.user.id, payload.table, targetRecord);
              if (!hasAccess) return;
            }
          }
          emit.next(payload);
        };

        // 啟動追補與訂閱邏輯
        const startSubscription = async () => {
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
              const result = await db.query(sql, [lastTxid.toString()]);
              
              for (const row of result.rows) {
                await handleNotification(row);
              }
              console.log(`✅ Re-synced ${result.rows.length} events.`);
            } catch (err) {
              console.error('[Re-sync Error]', err);
            }
          }

          // 向全域事件總線訂閱
          const unsubscribe = eventBus.subscribe(handleNotification);
          return unsubscribe;
        };

        const subscriptionPromise = startSubscription();

        return () => {
          subscriptionPromise.then(unsubscribe => unsubscribe && unsubscribe());
        };
      });
    }),
});

// 匯出 AppRouter 的型別，供前端使用
export type AppRouter = typeof appRouter;