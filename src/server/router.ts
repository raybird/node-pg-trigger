import { router, procedure } from './trpc';
import { triggerRouter } from './procedures/trigger';
import { dataRouter } from './procedures/data';
import { observable } from '@trpc/server/observable';
import { dbNotificationListener } from './lib/listener';

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
   * Subscription: 訂閱資料庫事件
   */
  onDbEvent: procedure.subscription(() => {
    // 使用 tRPC 的 observable 來建立一個 subscription
    return observable<any>((emit) => {
      const handleNotification = (payload: any) => {
        // 當監聽器收到通知時，透過 emit.next() 將資料傳送給客戶端
        emit.next(payload);
      };

      // 監聽 'notification' 事件
      dbNotificationListener.on('notification', handleNotification);

      // 當 subscription 結束時，取消監聽，防止記憶體洩漏
      return () => {
        dbNotificationListener.off('notification', handleNotification);
      };
    });
  }),
});

// 匯出 AppRouter 的型別，供前端使用
export type AppRouter = typeof appRouter;