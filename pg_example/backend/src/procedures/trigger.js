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
exports.triggerRouter = void 0;
const trpc_1 = require("../trpc");
const zod_1 = require("zod");
exports.triggerRouter = (0, trpc_1.router)({
    create: trpc_1.publicProcedure
        .input(zod_1.z.object({ tableName: zod_1.z.string() }))
        .mutation((_a) => __awaiter(void 0, [_a], void 0, function* ({ input, ctx }) {
        const { tableName } = input;
        const functionName = 'public.notify_trigger';
        const triggerName = `trg_${tableName}_notify`;
        const createTriggerSql = `
        CREATE TRIGGER ${triggerName}
        AFTER INSERT OR UPDATE OR DELETE ON public."${tableName}"
        FOR EACH ROW EXECUTE FUNCTION ${functionName}();
      `;
        try {
            yield ctx.db.query(createTriggerSql);
            return { success: true, message: `Trigger for table '${tableName}' created.` };
        }
        catch (error) {
            if (error.code === '42P07') { // duplicate_object
                return { success: false, message: `Trigger for table '${tableName}' already exists.` };
            }
            console.error('Error creating trigger:', error);
            throw new Error(`Failed to create trigger for table '${tableName}'.`);
        }
    })),
    list: trpc_1.publicProcedure
        .query((_a) => __awaiter(void 0, [_a], void 0, function* ({ ctx }) {
        const query = `
        SELECT
          tgname AS trigger_name,
          relname AS table_name
        FROM
          pg_trigger tr
        JOIN
          pg_class cl ON tr.tgrelid = cl.oid
        WHERE
          tgfoid = (SELECT oid FROM pg_proc WHERE proname = 'notify_trigger')
          AND tgisinternal = false;
      `;
        const result = yield ctx.db.query(query);
        return result.rows;
    })),
    delete: trpc_1.publicProcedure
        .input(zod_1.z.object({ tableName: zod_1.z.string() }))
        .mutation((_a) => __awaiter(void 0, [_a], void 0, function* ({ input, ctx }) {
        const { tableName } = input;
        const triggerName = `trg_${tableName}_notify`;
        const deleteTriggerSql = `
        DROP TRIGGER IF EXISTS ${triggerName} ON public."${tableName}";
      `;
        try {
            yield ctx.db.query(deleteTriggerSql);
            return { success: true, message: `Trigger for table '${tableName}' deleted.` };
        }
        catch (error) {
            console.error('Error deleting trigger:', error);
            throw new Error(`Failed to delete trigger for table '${tableName}'.`);
        }
    })),
});
