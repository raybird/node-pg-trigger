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
const zod_1 = require("zod");
const trpc_1 = require("../trpc");
const db_1 = require("../lib/db");
const TableInput = zod_1.z.object({
    tableName: zod_1.z.string().min(1, "Table name cannot be empty."),
    schemaName: zod_1.z.string().optional().default('public'),
});
exports.triggerRouter = (0, trpc_1.router)({
    /**
     * Mutation: 為指定的資料表建立一個通知觸發器
     */
    create: trpc_1.procedure
        .input(TableInput)
        .mutation((_a) => __awaiter(void 0, [_a], void 0, function* ({ input }) {
        const { tableName, schemaName } = input;
        const triggerName = `t_notify_${tableName}`;
        const sql = `
        CREATE TRIGGER ${triggerName}
        AFTER INSERT OR UPDATE OR DELETE ON "${schemaName}"."${tableName}"
        FOR EACH ROW EXECUTE PROCEDURE public.notify_trigger();
      `;
        try {
            yield db_1.db.query(sql);
            return { success: true, message: `Trigger '${triggerName}' created for table '${schemaName}.${tableName}'.` };
        }
        catch (error) {
            throw new Error(`Failed to create trigger: ${error.message}`);
        }
    })),
    /**
     * Query: 查詢所有由本系統建立的觸發器
     */
    list: trpc_1.procedure
        .input(zod_1.z.object({ schemaName: zod_1.z.string().optional() }).optional())
        .query((_a) => __awaiter(void 0, [_a], void 0, function* ({ input }) {
        const schemaFilter = (input === null || input === void 0 ? void 0 : input.schemaName) ? `AND event_object_schema = '${input.schemaName}'` : '';
        const sql = `
        SELECT
          event_object_schema AS "schemaName",
          event_object_table AS "tableName",
          trigger_name AS "triggerName"
        FROM information_schema.triggers
        WHERE trigger_name LIKE 't_notify_%'
        ${schemaFilter}
        GROUP BY "schemaName", "tableName", "triggerName"
        ORDER BY "schemaName", "tableName";
      `;
        try {
            const result = yield db_1.db.query(sql);
            return result.rows;
        }
        catch (error) {
            throw new Error(`Failed to list triggers: ${error.message}`);
        }
    })),
    /**
     * Mutation: 刪除指定資料表的通知觸發器
     */
    delete: trpc_1.procedure
        .input(TableInput)
        .mutation((_a) => __awaiter(void 0, [_a], void 0, function* ({ input }) {
        const { tableName, schemaName } = input;
        const triggerName = `t_notify_${tableName}`;
        const sql = `DROP TRIGGER IF EXISTS ${triggerName} ON "${schemaName}"."${tableName}";`;
        try {
            yield db_1.db.query(sql);
            return { success: true, message: `Trigger '${triggerName}' deleted from table '${schemaName}.${tableName}'.` };
        }
        catch (error) {
            throw new Error(`Failed to delete trigger: ${error.message}`);
        }
    })),
});
