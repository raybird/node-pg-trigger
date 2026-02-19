import { z } from 'zod';
import { router, procedure } from '../trpc';
import { db } from '../lib/db';

const TableInput = z.object({
  tableName: z.string().min(1),
  schemaName: z.string().optional().default('public'),
  limit: z.number().optional().default(100),
  offset: z.number().optional().default(0),
});

const DocInput = z.object({
  tableName: z.string().min(1),
  schemaName: z.string().optional().default('public'),
  id: z.union([z.string(), z.number()]),
  idField: z.string().optional().default('id'),
});

const WriteInput = z.object({
  tableName: z.string().min(1),
  schemaName: z.string().optional().default('public'),
  record: z.record(z.any()),
});

const UpdateInput = DocInput.extend({
  record: z.record(z.any()),
});

export const dataRouter = router({
  /**
   * Query: 獲取資料表中的所有資料
   */
  list: procedure
    .input(TableInput)
    .query(async ({ input, ctx }) => {
      const { tableName, schemaName, limit, offset } = input;
      const sql = `SELECT * FROM "${schemaName}"."${tableName}" LIMIT $1 OFFSET $2;`;
      
      if (ctx.user) {
        const udb = await db.withUser(ctx.user.id);
        try {
          const result = await udb.query(sql, [limit, offset]);
          await udb.commit();
          return result.rows;
        } catch (error: any) {
          await udb.rollback();
          throw new Error(`RLS Fetch error for '${schemaName}.${tableName}': ${error.message}`);
        } finally {
          udb.release();
        }
      }

      const result = await db.query(sql, [limit, offset]);
      return result.rows;
    }),

  /**
   * Query: 獲取單筆資料
   */
  get: procedure
    .input(DocInput)
    .query(async ({ input, ctx }) => {
      const { tableName, schemaName, id, idField } = input;
      const sql = `SELECT * FROM "${schemaName}"."${tableName}" WHERE "${idField}" = $1 LIMIT 1;`;
      
      if (ctx.user) {
        const udb = await db.withUser(ctx.user.id);
        try {
          const result = await udb.query(sql, [id]);
          await udb.commit();
          return result.rows[0] || null;
        } catch (error: any) {
          await udb.rollback();
          throw new Error(`RLS Get error for ${schemaName}.${tableName}/${id}: ${error.message}`);
        } finally {
          udb.release();
        }
      }

      const result = await db.query(sql, [id]);
      return result.rows[0] || null;
    }),

  /**
   * Mutation: 新增資料
   */
  add: procedure
    .input(WriteInput)
    .mutation(async ({ input, ctx }) => {
      const { tableName, schemaName, record } = input;
      const keys = Object.keys(record);
      const values = Object.values(record);
      const columns = keys.map(k => `"${k}"`).join(', ');
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO "${schemaName}"."${tableName}" (${columns}) VALUES (${placeholders}) RETURNING *;`;

      if (ctx.user) {
        const udb = await db.withUser(ctx.user.id);
        try {
          const result = await udb.query(sql, values);
          await udb.commit();
          return result.rows[0];
        } catch (error: any) {
          await udb.rollback();
          throw new Error(`RLS Add error for '${schemaName}.${tableName}': ${error.message}`);
        } finally {
          udb.release();
        }
      }

      const result = await db.query(sql, values);
      return result.rows[0];
    }),

  /**
   * Mutation: 更新資料
   */
  update: procedure
    .input(UpdateInput)
    .mutation(async ({ input, ctx }) => {
      const { tableName, schemaName, id, idField, record } = input;
      const keys = Object.keys(record);
      const values = Object.values(record);
      
      const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
      const sql = `UPDATE "${schemaName}"."${tableName}" SET ${setClause} WHERE "${idField}" = $${keys.length + 1} RETURNING *;`;
      
      if (ctx.user) {
        const udb = await db.withUser(ctx.user.id);
        try {
          const result = await udb.query(sql, [...values, id]);
          await udb.commit();
          return result.rows[0] || null;
        } catch (error: any) {
          await udb.rollback();
          throw new Error(`RLS Update error for '${schemaName}.${tableName}': ${error.message}`);
        } finally {
          udb.release();
        }
      }

      const result = await db.query(sql, [...values, id]);
      return result.rows[0] || null;
    }),

  /**
   * Mutation: 刪除資料
   */
  delete: procedure
    .input(DocInput)
    .mutation(async ({ input, ctx }) => {
      const { tableName, schemaName, id, idField } = input;
      const sql = `DELETE FROM "${schemaName}"."${tableName}" WHERE "${idField}" = $1 RETURNING *;`;
      
      if (ctx.user) {
        const udb = await db.withUser(ctx.user.id);
        try {
          const result = await udb.query(sql, [id]);
          await udb.commit();
          return result.rows[0] || null;
        } catch (error: any) {
          await udb.rollback();
          throw new Error(`RLS Delete error for '${schemaName}.${tableName}': ${error.message}`);
        } finally {
          udb.release();
        }
      }

      const result = await db.query(sql, [id]);
      return result.rows[0] || null;
    }),
});
