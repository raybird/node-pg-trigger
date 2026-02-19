import { z } from 'zod';
import { router, procedure } from '../trpc';
import { db } from '../lib/db';

const TableInput = z.object({
  tableName: z.string().min(1, "Table name cannot be empty."),
});

export const triggerRouter = router({
  /**
   * Mutation: 為指定的資料表建立一個通知觸發器
   */
  create: procedure
    .input(TableInput)
    .mutation(async ({ input }) => {
      const { tableName } = input;
      const triggerName = `t_notify_${tableName}`;

      const sql = `
        CREATE TRIGGER ${triggerName}
        AFTER INSERT OR UPDATE OR DELETE ON "${tableName}"
        FOR EACH ROW EXECUTE PROCEDURE public.notify_trigger();
      `;

      try {
        await db.query(sql);
        return { success: true, message: `Trigger '${triggerName}' created for table '${tableName}'.` };
      } catch (error: any) {
        throw new Error(`Failed to create trigger: ${error.message}`);
      }
    }),

  /**
   * Query: 查詢所有由本系統建立的觸發器
   */
  list: procedure
    .query(async () => {
      const sql = `
        SELECT
          event_object_table AS "tableName",
          trigger_name AS "triggerName"
        FROM information_schema.triggers
        WHERE trigger_name LIKE 't_notify_%'
        GROUP BY "tableName", "triggerName"
        ORDER BY "tableName";
      `;
      
      try {
        const result = await db.query<{ tableName: string, triggerName: string }>(sql);
        return result.rows;
      } catch (error: any) {
        throw new Error(`Failed to list triggers: ${error.message}`);
      }
    }),

  /**
   * Mutation: 刪除指定資料表的通知觸發器
   */
  delete: procedure
    .input(TableInput)
    .mutation(async ({ input }) => {
      const { tableName } = input;
      const triggerName = `t_notify_${tableName}`;

      const sql = `DROP TRIGGER IF EXISTS ${triggerName} ON "${tableName}";`;

      try {
        await db.query(sql);
        return { success: true, message: `Trigger '${triggerName}' deleted from table '${tableName}'.` };
      } catch (error: any) {
        throw new Error(`Failed to delete trigger: ${error.message}`);
      }
    }),
});