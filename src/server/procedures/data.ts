import { z } from 'zod';
import { router, procedure } from '../trpc';
import { db } from '../lib/db';

const FilterOperator = z.enum(['==', '>', '<', '>=', '<=', '!=', 'contains']);

const TableInput = z.object({
  tableName: z.string().min(1),
  schemaName: z.string().optional().default('public'),
  limit: z.number().optional().default(100),
  offset: z.number().optional().default(0),
  where: z.array(z.object({
    field: z.string(),
    operator: FilterOperator,
    value: z.any()
  })).optional(),
  orderBy: z.array(z.object({
    field: z.string(),
    direction: z.enum(['asc', 'desc']).default('asc')
  })).optional()
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

/**
 * 輔助函式：構建 SQL WHERE 子句
 */
function buildWhereClause(where: any[] | undefined, startParamIndex: number) {
  if (!where || where.length === 0) return { clause: '', params: [] };

  const params: any[] = [];
  const parts = where.map((filter, index) => {
    const placeholder = `$${startParamIndex + index}`;
    let operator = '=';
    let value = filter.value;

    switch (filter.operator) {
      case '==': operator = '='; break;
      case '!=': operator = '!='; break;
      case '>': operator = '>'; break;
      case '<': operator = '<'; break;
      case '>=': operator = '>='; break;
      case '<=': operator = '<='; break;
      case 'contains': 
        operator = 'LIKE'; 
        value = `%${value}%`;
        break;
    }

    params.push(value);
    return `"${filter.field}" ${operator} ${placeholder}`;
  });

  return {
    clause: `WHERE ${parts.join(' AND ')}`,
    params
  };
}

/**
 * 輔助函式：構建 SQL ORDER BY 子句
 */
function buildOrderByClause(orderBy: any[] | undefined) {
  if (!orderBy || orderBy.length === 0) return '';
  const parts = orderBy.map(item => `"${item.field}" ${item.direction.toUpperCase()}`);
  return `ORDER BY ${parts.join(', ')}`;
}

export const dataRouter = router({
  /**
   * Query: 獲取資料表中的資料（支援過濾與排序）
   */
  list: procedure
    .input(TableInput)
    .query(async ({ input, ctx }) => {
      const { tableName, schemaName, limit, offset, where, orderBy } = input;
      
      const { clause: whereClause, params: whereParams } = buildWhereClause(where, 1);
      const orderByClause = buildOrderByClause(orderBy);
      
      const limitParamIndex = whereParams.length + 1;
      const offsetParamIndex = whereParams.length + 2;
      
      const sql = `
        SELECT * FROM "${schemaName}"."${tableName}" 
        ${whereClause} 
        ${orderByClause} 
        LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex};
      `;
      
      const allParams = [...whereParams, limit, offset];

      if (ctx.user) {
        const udb = await db.withUser(ctx.user.id);
        try {
          const result = await udb.query(sql, allParams);
          await udb.commit();
          return result.rows;
        } catch (error: any) {
          await udb.rollback();
          throw new Error(`RLS Fetch error for '${schemaName}.${tableName}': ${error.message}`);
        } finally {
          udb.release();
        }
      }

      const result = await db.query(sql, allParams);
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
