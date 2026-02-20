import { z } from "zod";
import { router, procedure } from "../trpc";
import { db } from "../lib/db";

const FilterOperator = z.enum([
  "==",
  ">",
  "<",
  ">=",
  "<=",
  "!=",
  "contains",
  "array-contains",
  "array-contains-any",
  "in",
  "not-in",
]);

const IncludeSchema = z.record(z.object({
  targetTable: z.string(),
  localField: z.string(),
  targetField: z.string().optional().default("id"),
  type: z.enum(["1:1", "1:N"]).optional().default("1:1"),
  schemaName: z.string().optional().default("public"),
  select: z.array(z.string()).optional()
}));

const TableInput = z.object({
  tableName: z.string().min(1),
  schemaName: z.string().optional().default("public"),
  limit: z.number().optional().default(100),
  offset: z.number().optional().default(0),
  include: IncludeSchema.optional(),
  where: z
    .array(
      z.object({
        field: z.string(),
        operator: FilterOperator,
        value: z.any(),
      }),
    )
    .optional(),
  orderBy: z
    .array(
      z.object({
        field: z.string(),
        direction: z.enum(["asc", "desc"]).default("asc"),
      }),
    )
    .optional(),
});

const DocInput = z.object({
  tableName: z.string().min(1),
  schemaName: z.string().optional().default("public"),
  id: z.union([z.string(), z.number()]),
  idField: z.string().optional().default("id"),
  include: IncludeSchema.optional(),
});

const WriteInput = z.object({
  tableName: z.string().min(1),
  schemaName: z.string().optional().default("public"),
  record: z.record(z.any()),
});

const UpdateInput = DocInput.extend({
  record: z.record(z.any()),
  where: z
    .array(
      z.object({
        field: z.string(),
        operator: FilterOperator,
        value: z.any(),
      }),
    )
    .optional(),
});

const SetInput = DocInput.extend({
  record: z.record(z.any()),
  merge: z.boolean().optional().default(false),
  where: z
    .array(
      z.object({
        field: z.string(),
        operator: FilterOperator,
        value: z.any(),
      }),
    )
    .optional(),
});

const BatchInput = z.object({
  operations: z.array(
    z.object({
      type: z.enum(["set", "update", "delete"]),
      tableName: z.string(),
      schemaName: z.string().optional().default("public"),
      id: z.any().optional(),
      idField: z.string().optional().default("id"),
      record: z.record(z.any()).optional(),
      merge: z.boolean().optional().default(false),
      where: z
        .array(
          z.object({
            field: z.string(),
            operator: FilterOperator,
            value: z.any(),
          }),
        )
        .optional(),
    }),
  ),
});

const AggregateInput = z.object({
  tableName: z.string().min(1),
  schemaName: z.string().optional().default("public"),
  where: z
    .array(
      z.object({
        field: z.string(),
        operator: FilterOperator,
        value: z.any(),
      }),
    )
    .optional(),
  aggregations: z.array(
    z.object({
      type: z.enum(["count", "sum", "avg", "min", "max"]),
      field: z.string().optional(),
      alias: z.string(),
    }),
  ),
});

/**
 * 輔助函式：構建 SQL WHERE 子句
 */
function buildWhereClause(where: any[] | undefined, startParamIndex: number) {
  if (!where || where.length === 0) return { clause: "", params: [] };

  const params: any[] = [];
  const parts = where.map((filter, index) => {
    const placeholder = `$${startParamIndex + index}`;
    let operator = "=";
    let value = filter.value;

    switch (filter.operator) {
      case "==":
        operator = "=";
        break;
      case "!=":
        operator = "!=";
        break;
      case ">":
        operator = ">";
        break;
      case "<":
        operator = "<";
        break;
      case ">=":
        operator = ">=";
        break;
      case "<=":
        operator = "<=";
        break;
      case "in":
        params.push(Array.isArray(value) ? value : [value]);
        return `"${filter.field}" = ANY(${placeholder})`;
      case "not-in":
        params.push(Array.isArray(value) ? value : [value]);
        return `NOT ("${filter.field}" = ANY(${placeholder}))`;
      case "contains":
        operator = "LIKE";
        value = `%${value}%`;
        break;
      case "array-contains":
        params.push(value);
        return `to_jsonb("${filter.field}") @> jsonb_build_array(${placeholder})`;
      case "array-contains-any":
        params.push((Array.isArray(value) ? value : [value]).map(String));
        return `EXISTS (SELECT 1 FROM jsonb_array_elements_text(to_jsonb("${filter.field}")) AS e(v) WHERE e.v = ANY(${placeholder}))`;
    }

    params.push(value);
    return `"${filter.field}" ${operator} ${placeholder}`;
  });

  return {
    clause: `WHERE ${parts.join(" AND ")}`,
    params,
  };
}

/**
 * 輔助函式：構建 SQL ORDER BY 子句
 */
function buildOrderByClause(orderBy: any[] | undefined) {
  if (!orderBy || orderBy.length === 0) return "";
  const parts = orderBy.map(
    (item) => `"${item.field}" ${item.direction.toUpperCase()}`,
  );
  return `ORDER BY ${parts.join(", ")}`;
}

/**
 * 輔助函式：處理寫入資料 (支援 FieldValue)
 */
function prepareWrite(record: Record<string, any>, startParamIndex: number) {
  const keys = Object.keys(record);
  const sqlValues: string[] = [];
  const params: any[] = [];
  let currentIndex = startParamIndex;

  keys.forEach((key) => {
    const val = record[key];
    // 檢查是否為 FieldValue 哨兵值 (考慮 JSON 序列化後的格式)
    if (val && typeof val === "object" && val._isFieldValue) {
      if (val.type === "SERVER_TIMESTAMP") {
        sqlValues.push("now()");
      } else if (val.type === "INCREMENT") {
        sqlValues.push(`$${currentIndex}`);
        params.push(val.value);
        currentIndex++;
      } else if (val.type === "DELETE_FIELD") {
        sqlValues.push("NULL");
      } else if (val.type === "ARRAY_UNION") {
        sqlValues.push(
          `ARRAY(SELECT DISTINCT x FROM unnest($${currentIndex}) x)`,
        );
        params.push(val.value);
        currentIndex++;
      } else if (val.type === "ARRAY_REMOVE") {
        sqlValues.push("'{}'");
      }
    } else {
      sqlValues.push(`$${currentIndex}`);
      params.push(val);
      currentIndex++;
    }
  });

  return {
    columns: keys.map((k) => `"${k}"`).join(", "),
    placeholders: sqlValues.join(", "),
    params,
  };
}

/**
 * 輔助函式：處理更新資料 (支援 FieldValue)
 */
function prepareUpdate(record: Record<string, any>, startParamIndex: number) {
  const keys = Object.keys(record);
  const setParts: string[] = [];
  const params: any[] = [];
  let currentIndex = startParamIndex;

  keys.forEach((key) => {
    const val = record[key];
    if (val && typeof val === "object" && val._isFieldValue) {
      if (val.type === "SERVER_TIMESTAMP") {
        setParts.push(`"${key}" = now()`);
      } else if (val.type === "INCREMENT") {
        setParts.push(`"${key}" = "${key}" + $${currentIndex}`);
        params.push(val.value);
        currentIndex++;
      } else if (val.type === "DELETE_FIELD") {
        setParts.push(`"${key}" = NULL`);
      } else if (val.type === "ARRAY_UNION") {
        // 使用 UNION 確保元素唯一性
        setParts.push(
          `"${key}" = ARRAY(SELECT x FROM unnest(COALESCE("${key}", '{}')) x UNION SELECT x FROM unnest($${currentIndex}) x)`,
        );
        params.push(val.value);
        currentIndex++;
      } else if (val.type === "ARRAY_REMOVE") {
        // 過濾掉指定的元素
        setParts.push(
          `"${key}" = ARRAY(SELECT x FROM unnest("${key}") x WHERE x <> ALL($${currentIndex}))`,
        );
        params.push(val.value);
        currentIndex++;
      }
    } else {
      setParts.push(`"${key}" = $${currentIndex}`);
      params.push(val);
      currentIndex++;
    }
  });

  return {
    setClause: setParts.join(", "),
    params,
    lastIndex: currentIndex,
  };
}

/**
 * 輔助函式：構建 SQL INCLUDE (Joins)
 */
function buildIncludeClause(include: any | undefined) {
  if (!include) return { selectParts: [], joinParts: [] };

  const selectParts: string[] = [];
  const joinParts: string[] = [];

  Object.entries(include).forEach(([alias, config]: [string, any]) => {
    const { targetTable, localField, targetField, type, schemaName, select } = config;
    const target = `"${schemaName}"."${targetTable}"`;
    const cols = select ? select.map((c: string) => `"${c}"`).join(', ') : '*';

    if (type === "1:1") {
      joinParts.push(`
        LEFT JOIN LATERAL (
          SELECT json_build_object(${select ? select.map((c: string) => `'${c}', "${c}"`).join(', ') : 'row_to_json(rel.*)'}) as "${alias}"
          FROM ${target} rel
          WHERE rel."${targetField}" = base."${localField}"
          LIMIT 1
        ) "${alias}_lat" ON true
      `);
      selectParts.push(`"${alias}_lat"."${alias}"`);
    } else {
      joinParts.push(`
        LEFT JOIN LATERAL (
          SELECT COALESCE(json_agg(row_to_json(rel.*)), '[]'::json) as "${alias}"
          FROM (
            SELECT ${cols} FROM ${target} r 
            WHERE r."${targetField}" = base."${localField}"
          ) rel
        ) "${alias}_lat" ON true
      `);
      selectParts.push(`"${alias}_lat"."${alias}"`);
    }
  });

  return { selectParts, joinParts };
}

export const dataRouter = router({
  /**
   * Query: 獲取資料表中的資料（支援過濾、排序與關聯展開）
   */
  list: procedure.input(TableInput).query(async ({ input, ctx }) => {
    const { tableName, schemaName, limit, offset, where, orderBy, include } = input;

    const { clause: whereClause, params: whereParams } = buildWhereClause(
      where,
      1,
    );
    const orderByClause = buildOrderByClause(orderBy);
    const { selectParts, joinParts } = buildIncludeClause(include);

    const limitParamIndex = whereParams.length + 1;
    const offsetParamIndex = whereParams.length + 2;

    const sql = `
        SELECT base.* ${selectParts.length > 0 ? ', ' + selectParts.join(', ') : ''}
        FROM "${schemaName}"."${tableName}" base
        ${joinParts.join(' ')}
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
        throw new Error(
          `RLS Fetch error for '${schemaName}.${tableName}': ${error.message}`,
        );
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
  get: procedure.input(DocInput).query(async ({ input, ctx }) => {
    const { tableName, schemaName, id, idField, include } = input;
    const { selectParts, joinParts } = buildIncludeClause(include);

    const sql = `
      SELECT base.* ${selectParts.length > 0 ? ', ' + selectParts.join(', ') : ''}
      FROM "${schemaName}"."${tableName}" base
      ${joinParts.join(' ')}
      WHERE base."${idField}" = $1 
      LIMIT 1;
    `;

    if (ctx.user) {
      const udb = await db.withUser(ctx.user.id);
      try {
        const result = await udb.query(sql, [id]);
        await udb.commit();
        return result.rows[0] || null;
      } catch (error: any) {
        await udb.rollback();
        throw new Error(
          `RLS Get error for ${schemaName}.${tableName}/${id}: ${error.message}`,
        );
      } finally {
        udb.release();
      }
    }

    const result = await db.query(sql, [id]);
    return result.rows[0] || null;
  }),

  /**
   * Query: 聚合查詢 (Count, Sum, Avg, Min, Max)
   */
  aggregate: procedure.input(AggregateInput).query(async ({ input, ctx }) => {
    const { tableName, schemaName, where, aggregations } = input;

    const { clause: whereClause, params: whereParams } = buildWhereClause(
      where,
      1,
    );

    const aggParts = aggregations.map((agg) => {
      const field = agg.field ? `"${agg.field}"` : "*";
      switch (agg.type) {
        case "count":
          return `COUNT(${field}) AS "${agg.alias}"`;
        case "sum":
          return `SUM(${field}) AS "${agg.alias}"`;
        case "avg":
          return `AVG(${field}) AS "${agg.alias}"`;
        case "min":
          return `MIN(${field}) AS "${agg.alias}"`;
        case "max":
          return `MAX(${field}) AS "${agg.alias}"`;
        default:
          throw new Error(`Unsupported aggregation type: ${agg.type}`);
      }
    });

    const sql = `
      SELECT ${aggParts.join(", ")}
      FROM "${schemaName}"."${tableName}"
      ${whereClause};
    `;

    if (ctx.user) {
      const udb = await db.withUser(ctx.user.id);
      try {
        const result = await udb.query(sql, whereParams);
        await udb.commit();
        return result.rows[0];
      } catch (error: any) {
        await udb.rollback();
        throw new Error(
          `RLS Aggregate error for '${schemaName}.${tableName}': ${error.message}`,
        );
      } finally {
        udb.release();
      }
    }

    const result = await db.query(sql, whereParams);
    return result.rows[0];
  }),

  /**
   * Mutation: 新增資料
   */
  add: procedure.input(WriteInput).mutation(async ({ input, ctx }) => {
    const { tableName, schemaName, record } = input;
    const { columns, placeholders, params } = prepareWrite(record, 1);

    const sql = `INSERT INTO "${schemaName}"."${tableName}" (${columns}) VALUES (${placeholders}) RETURNING *;`;

    if (ctx.user) {
      const udb = await db.withUser(ctx.user.id);
      try {
        const result = await udb.query(sql, params);
        await udb.commit();
        return result.rows[0];
      } catch (error: any) {
        await udb.rollback();
        throw new Error(
          `RLS Add error for '${schemaName}.${tableName}': ${error.message}`,
        );
      } finally {
        udb.release();
      }
    }

    const result = await db.query(sql, params);
    return result.rows[0];
  }),

  /**
   * Mutation: 更新資料
   */
  update: procedure.input(UpdateInput).mutation(async ({ input, ctx }) => {
    const { tableName, schemaName, id, idField, record, where } = input;
    const { setClause, params, lastIndex } = prepareUpdate(record, 1);

    // 處理額外的 WHERE 條件
    const { clause: extraClause, params: extraParams } = buildWhereClause(
      where,
      lastIndex + 1,
    );

    const sql = `
      UPDATE "${schemaName}"."${tableName}" 
      SET ${setClause} 
      WHERE "${idField}" = $${lastIndex} 
      ${extraClause ? `AND ${extraClause.replace("WHERE ", "")}` : ""}
      RETURNING *;
    `;

    const allParams = [...params, id, ...extraParams];

    if (ctx.user) {
      const udb = await db.withUser(ctx.user.id);
      try {
        const result = await udb.query(sql, allParams);
        if (result.rowCount === 0) {
          throw new Error(
            "Update failed: Precondition mismatch or record not found.",
          );
        }
        await udb.commit();
        return result.rows[0] || null;
      } catch (error: any) {
        await udb.rollback();
        throw new Error(
          `RLS Update error for '${schemaName}.${tableName}': ${error.message}`,
        );
      } finally {
        udb.release();
      }
    }

    const result = await db.query(sql, allParams);
    if (result.rowCount === 0) {
      throw new Error(
        "Update failed: Precondition mismatch or record not found.",
      );
    }
    return result.rows[0] || null;
  }),

  /**
   * Mutation: 設定資料（Firestore-like set，支援 merge）
   */
  set: procedure.input(SetInput).mutation(async ({ input, ctx }) => {
    const { tableName, schemaName, id, idField, record, merge, where } = input;
    const upsertRecord = { ...record, [idField]: id };

    const {
      columns,
      placeholders,
      params: insertParams,
    } = prepareWrite(upsertRecord, 1);

    const { setClause, params: mergeParams } = prepareUpdate(
      record,
      insertParams.length + 1,
    );

    // 處理額外的 WHERE 條件
    const { clause: extraClause, params: extraParams } = buildWhereClause(
      where,
      insertParams.length + mergeParams.length + 1,
    );

    const mergeSetClause = setClause || `"${idField}" = EXCLUDED."${idField}"`;

    const replaceSetClause =
      Object.keys(upsertRecord)
        .map((key) => `"${key}" = EXCLUDED."${key}"`)
        .join(", ") || `"${idField}" = EXCLUDED."${idField}"`;

    const onConflictSetClause = merge ? mergeSetClause : replaceSetClause;

    const sql = `
      INSERT INTO "${schemaName}"."${tableName}" (${columns})
      VALUES (${placeholders})
      ON CONFLICT ("${idField}")
      DO UPDATE SET ${onConflictSetClause}
      ${extraClause ? `WHERE ${extraClause.replace("WHERE ", "")}` : ""}
      RETURNING *;
    `;

    const allParams = merge
      ? [...insertParams, ...mergeParams, ...extraParams]
      : [...insertParams, ...extraParams];

    if (ctx.user) {
      const udb = await db.withUser(ctx.user.id);
      try {
        const result = await udb.query(sql, allParams);
        if (result.rowCount === 0) {
          throw new Error(
            "Set failed: Precondition mismatch (record might have changed).",
          );
        }
        await udb.commit();
        return result.rows[0] || null;
      } catch (error: any) {
        await udb.rollback();
        throw new Error(
          `RLS Set error for '${schemaName}.${tableName}/${id}': ${error.message}`,
        );
      } finally {
        udb.release();
      }
    }

    const result = await db.query(sql, allParams);
    if (result.rowCount === 0) {
      throw new Error(
        "Set failed: Precondition mismatch (record might have changed).",
      );
    }
    return result.rows[0] || null;
  }),

  /**
   * Mutation: 刪除資料
   */
  delete: procedure.input(DocInput.extend({
    where: z.array(z.object({
      field: z.string(),
      operator: FilterOperator,
      value: z.any()
    })).optional()
  })).mutation(async ({ input, ctx }) => {
    const { tableName, schemaName, id, idField, where } = input;
    
    const { clause: extraClause, params: extraParams } = buildWhereClause(
      where,
      2,
    );

    const sql = `
      DELETE FROM "${schemaName}"."${tableName}" 
      WHERE "${idField}" = $1 
      ${extraClause ? `AND ${extraClause.replace("WHERE ", "")}` : ""}
      RETURNING *;
    `;

    if (ctx.user) {
      const udb = await db.withUser(ctx.user.id);
      try {
        const result = await udb.query(sql, [id, ...extraParams]);
        if (result.rowCount === 0) {
          throw new Error("Delete failed: Precondition mismatch or record not found.");
        }
        await udb.commit();
        return result.rows[0] || null;
      } catch (error: any) {
        await udb.rollback();
        throw new Error(
          `RLS Delete error for '${schemaName}.${tableName}': ${error.message}`,
        );
      } finally {
        udb.release();
      }
    }

    const result = await db.query(sql, [id, ...extraParams]);
    if (result.rowCount === 0) {
      throw new Error("Delete failed: Precondition mismatch or record not found.");
    }
    return result.rows[0] || null;
  }),

  /**
   * Mutation: 批量異動 (Atomicity Batch)
   */
  batch: procedure.input(BatchInput).mutation(async ({ input, ctx }) => {
    const udb = await db.withUser(ctx.user?.id || "system");

    try {
      for (const op of input.operations) {
        if (op.type === "set" && op.id !== undefined) {
          const upsertRecord = { ...(op.record || {}), [op.idField]: op.id };
          const {
            columns,
            placeholders,
            params: insertParams,
          } = prepareWrite(upsertRecord, 1);

          const { setClause, params: mergeParams } = prepareUpdate(
            op.record || {},
            insertParams.length + 1,
          );

          // 處理額外的 WHERE 條件
          const { clause: extraClause, params: extraParams } = buildWhereClause(
            op.where,
            insertParams.length + mergeParams.length + 1,
          );

          const mergeSetClause =
            setClause || `"${op.idField}" = EXCLUDED."${op.idField}"`;
          const replaceSetClause =
            Object.keys(upsertRecord)
              .map((key) => `"${key}" = EXCLUDED."${key}"`)
              .join(", ") || `"${op.idField}" = EXCLUDED."${op.idField}"`;

          const sql = `
            INSERT INTO "${op.schemaName}"."${op.tableName}" (${columns})
            VALUES (${placeholders})
            ON CONFLICT ("${op.idField}")
            DO UPDATE SET ${op.merge ? mergeSetClause : replaceSetClause}
            ${extraClause ? `WHERE ${extraClause.replace("WHERE ", "")}` : ""}
            RETURNING *;
          `;

          const allParams = op.merge
            ? [...insertParams, ...mergeParams, ...extraParams]
            : [...insertParams, ...extraParams];

          const result = await udb.query(sql, allParams);
          if (result.rowCount === 0) {
            throw new Error(`Batch Set failed for ${op.tableName}: Precondition mismatch.`);
          }
        } else if (op.type === "set" || (op.type === "update" && !op.id)) {
          // 注意：這裡簡化處理，set 如果沒 id 則視為 insert
          const { columns, placeholders, params } = prepareWrite(
            op.record || {},
            1,
          );
          const sql = `INSERT INTO "${op.schemaName}"."${op.tableName}" (${columns}) VALUES (${placeholders});`;
          await udb.query(sql, params);
        } else if (op.type === "update" && op.id) {
          const { setClause, params, lastIndex } = prepareUpdate(
            op.record || {},
            1,
          );
          
          const { clause: extraClause, params: extraParams } = buildWhereClause(
            op.where,
            lastIndex + 1,
          );

          const sql = `
            UPDATE "${op.schemaName}"."${op.tableName}" 
            SET ${setClause} 
            WHERE "${op.idField}" = $${lastIndex}
            ${extraClause ? `AND ${extraClause.replace("WHERE ", "")}` : ""}
          `;
          
          const result = await udb.query(sql, [...params, op.id, ...extraParams]);
          if (result.rowCount === 0) {
            throw new Error(`Batch Update failed for ${op.tableName}: Precondition mismatch.`);
          }
        } else if (op.type === "delete" && op.id) {
          const { clause: extraClause, params: extraParams } = buildWhereClause(
            op.where,
            2,
          );

          const sql = `
            DELETE FROM "${op.schemaName}"."${op.tableName}" 
            WHERE "${op.idField}" = $1
            ${extraClause ? `AND ${extraClause.replace("WHERE ", "")}` : ""}
          `;
          
          const result = await udb.query(sql, [op.id, ...extraParams]);
          if (result.rowCount === 0) {
            throw new Error(`Batch Delete failed for ${op.tableName}: Precondition mismatch.`);
          }
        }
      }
      await udb.commit();
      return { success: true, count: input.operations.length };
    } catch (error: any) {
      await udb.rollback();
      throw new Error(`Batch Transaction Failed: ${error.message}`);
    } finally {
      udb.release();
    }
  }),
});
