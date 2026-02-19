"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.protectedProcedure = exports.procedure = exports.router = exports.t = void 0;
const server_1 = require("@trpc/server");
// 初始化 tRPC，並傳入我們的 Context 型別
exports.t = server_1.initTRPC.context().create();
// 為了方便起見，匯出常用的 router 和 procedure
exports.router = exports.t.router;
exports.procedure = exports.t.procedure;
/**
 * 中介層：確保使用者已登入
 */
const isAuthed = exports.t.middleware(({ next, ctx }) => {
    if (!ctx.user) {
        throw new server_1.TRPCError({ code: 'UNAUTHORIZED' });
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
exports.protectedProcedure = exports.t.procedure.use(isAuthed);
