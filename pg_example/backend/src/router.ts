import { router, publicProcedure } from './trpc';
import { triggerRouter } from './procedures/trigger';
import { DbEventEmitter } from './lib/listener';
import { db } from './lib/db';
import { observable } from '@trpc/server/observable';

const dbEventEmitter = new DbEventEmitter(db);

export const appRouter = router({
  trigger: triggerRouter,
  onDbEvent: publicProcedure.subscription(() => {
    return observable<any>((emit) => {
      const onEvent = (data: any) => {
        emit.next(data);
      };
      dbEventEmitter.on('dbEvent', onEvent);
      return () => {
        dbEventEmitter.off('dbEvent', onEvent);
      };
    });
  }),
});

export type AppRouter = typeof appRouter;
