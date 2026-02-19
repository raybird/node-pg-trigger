import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';

// 初始化 tRPC，並傳入我們的 Context 型別
export const t = initTRPC.context<Context>().create();

// 為了方便起見，匯出常用的 router 和 procedure
export const router = t.router;
export const procedure = t.procedure;

/**
 * 中介層：確保使用者已登入
 */
const isAuthed = t.middleware(({ next, ctx }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      user: ctx.user,
    },
  });
});

/**
 * 受保護的程序
 */
export const protectedProcedure = t.procedure.use(isAuthed);
