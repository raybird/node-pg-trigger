import { publicProcedure, router } from '../trpc';
import { z } from 'zod';

export const triggerRouter = router({
  create: publicProcedure
    .input(z.object({ tableName: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { tableName } = input;
      const functionName = 'public.notify_trigger';
      const triggerName = `trg_${tableName}_notify`;

      const createTriggerSql = `
        CREATE TRIGGER ${triggerName}
        AFTER INSERT OR UPDATE OR DELETE ON public."${tableName}"
        FOR EACH ROW EXECUTE FUNCTION ${functionName}();
      `;

      try {
        await ctx.db.query(createTriggerSql);
        return { success: true, message: `Trigger for table '${tableName}' created.` };
      } catch (error: any) {
        if (error.code === '42P07') { // duplicate_object
          return { success: false, message: `Trigger for table '${tableName}' already exists.` };
        }
        console.error('Error creating trigger:', error);
        throw new Error(`Failed to create trigger for table '${tableName}'.`);
      }
    }),

  list: publicProcedure
    .query(async ({ ctx }) => {
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
      const result = await ctx.db.query(query);
      return result.rows;
    }),

  delete: publicProcedure
    .input(z.object({ tableName: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { tableName } = input;
      const triggerName = `trg_${tableName}_notify`;

      const deleteTriggerSql = `
        DROP TRIGGER IF EXISTS ${triggerName} ON public."${tableName}";
      `;

      try {
        await ctx.db.query(deleteTriggerSql);
        return { success: true, message: `Trigger for table '${tableName}' deleted.` };
      } catch (error) {
        console.error('Error deleting trigger:', error);
        throw new Error(`Failed to delete trigger for table '${tableName}'.`);
      }
    }),
});
