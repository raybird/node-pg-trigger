"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appRouter = void 0;
const trpc_1 = require("./trpc");
const trigger_1 = require("./procedures/trigger");
const listener_1 = require("./lib/listener");
const db_1 = require("./lib/db");
const observable_1 = require("@trpc/server/observable");
const dbEventEmitter = new listener_1.DbEventEmitter(db_1.db);
exports.appRouter = (0, trpc_1.router)({
    trigger: trigger_1.triggerRouter,
    onDbEvent: trpc_1.publicProcedure.subscription(() => {
        return (0, observable_1.observable)((emit) => {
            const onEvent = (data) => {
                emit.next(data);
            };
            dbEventEmitter.on('dbEvent', onEvent);
            return () => {
                dbEventEmitter.off('dbEvent', onEvent);
            };
        });
    }),
});
