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
exports.dataRouter = void 0;
const zod_1 = require("zod");
const trpc_1 = require("../trpc");
const db_1 = require("../lib/db");
const FilterOperator = zod_1.z.enum(['==', '>', '<', '>=', '<=', '!=', 'contains']);
const TableInput = zod_1.z.object({
    tableName: zod_1.z.string().min(1),
    schemaName: zod_1.z.string().optional().default('public'),
    limit: zod_1.z.number().optional().default(100),
    offset: zod_1.z.number().optional().default(0),
    where: zod_1.z.array(zod_1.z.object({
        field: zod_1.z.string(),
        operator: FilterOperator,
        value: zod_1.z.any()
    })).optional(),
    orderBy: zod_1.z.array(zod_1.z.object({
        field: zod_1.z.string(),
        direction: zod_1.z.enum(['asc', 'desc']).default('asc')
    })).optional()
});
const DocInput = zod_1.z.object({
    tableName: zod_1.z.string().min(1),
    schemaName: zod_1.z.string().optional().default('public'),
    id: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]),
    idField: zod_1.z.string().optional().default('id'),
});
const WriteInput = zod_1.z.object({
    tableName: zod_1.z.string().min(1),
    schemaName: zod_1.z.string().optional().default('public'),
    record: zod_1.z.record(zod_1.z.any()),
});
const UpdateInput = DocInput.extend({
    record: zod_1.z.record(zod_1.z.any()),
});
/**
 * 輔助函式：構建 SQL WHERE 子句
 */
function buildWhereClause(where, startParamIndex) {
    if (!where || where.length === 0)
        return { clause: '', params: [] };
    const params = [];
    const parts = where.map((filter, index) => {
        const placeholder = `$${startParamIndex + index}`;
        let operator = '=';
        let value = filter.value;
        switch (filter.operator) {
            case '==':
                operator = '=';
                break;
            case '!=':
                operator = '!=';
                break;
            case '>':
                operator = '>';
                break;
            case '<':
                operator = '<';
                break;
            case '>=':
                operator = '>=';
                break;
            case '<=':
                operator = '<=';
                break;
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
function buildOrderByClause(orderBy) {
    if (!orderBy || orderBy.length === 0)
        return '';
    const parts = orderBy.map(item => `"${item.field}" ${item.direction.toUpperCase()}`);
    return `ORDER BY ${parts.join(', ')}`;
}
/**
 * 輔助函式：處理寫入資料 (支援 FieldValue)
 */
function prepareWrite(record, startParamIndex) {
    const keys = Object.keys(record);
    const sqlValues = [];
    const params = [];
    let currentIndex = startParamIndex;
    keys.forEach(key => {
        const val = record[key];
        // 檢查是否為 FieldValue 哨兵值 (考慮 JSON 序列化後的格式)
        if (val && typeof val === 'object' && val._isFieldValue) {
            if (val.type === 'SERVER_TIMESTAMP') {
                sqlValues.push('now()');
            }
            else if (val.type === 'INCREMENT') {
                sqlValues.push(`$${currentIndex}`);
                params.push(val.value);
                currentIndex++;
            }
            else if (val.type === 'DELETE_FIELD') {
                sqlValues.push('NULL');
            }
            else if (val.type === 'ARRAY_UNION') {
                sqlValues.push(`ARRAY(SELECT DISTINCT x FROM unnest($${currentIndex}) x)`);
                params.push(val.value);
                currentIndex++;
            }
            else if (val.type === 'ARRAY_REMOVE') {
                sqlValues.push("'{}'");
            }
        }
        else {
            sqlValues.push(`$${currentIndex}`);
            params.push(val);
            currentIndex++;
        }
    });
    return {
        columns: keys.map(k => `"${k}"`).join(', '),
        placeholders: sqlValues.join(', '),
        params
    };
}
/**
 * 輔助函式：處理更新資料 (支援 FieldValue)
 */
function prepareUpdate(record, startParamIndex) {
    const keys = Object.keys(record);
    const setParts = [];
    const params = [];
    let currentIndex = startParamIndex;
    keys.forEach(key => {
        const val = record[key];
        if (val && typeof val === 'object' && val._isFieldValue) {
            if (val.type === 'SERVER_TIMESTAMP') {
                setParts.push(`"${key}" = now()`);
            }
            else if (val.type === 'INCREMENT') {
                setParts.push(`"${key}" = "${key}" + $${currentIndex}`);
                params.push(val.value);
                currentIndex++;
            }
            else if (val.type === 'DELETE_FIELD') {
                setParts.push(`"${key}" = NULL`);
            }
            else if (val.type === 'ARRAY_UNION') {
                // 使用 UNION 確保元素唯一性
                setParts.push(`"${key}" = ARRAY(SELECT x FROM unnest(COALESCE("${key}", '{}')) x UNION SELECT x FROM unnest($${currentIndex}) x)`);
                params.push(val.value);
                currentIndex++;
            }
            else if (val.type === 'ARRAY_REMOVE') {
                // 過濾掉指定的元素
                setParts.push(`"${key}" = ARRAY(SELECT x FROM unnest("${key}") x WHERE x <> ALL($${currentIndex}))`);
                params.push(val.value);
                currentIndex++;
            }
        }
        else {
            setParts.push(`"${key}" = $${currentIndex}`);
            params.push(val);
            currentIndex++;
        }
    });
    return {
        setClause: setParts.join(', '),
        params,
        lastIndex: currentIndex
    };
}
exports.dataRouter = (0, trpc_1.router)({
    /**
     * Query: 獲取資料表中的資料（支援過濾與排序）
     */
    list: trpc_1.procedure
        .input(TableInput)
        .query((_a) => __awaiter(void 0, [_a], void 0, function* ({ input, ctx }) {
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
            const udb = yield db_1.db.withUser(ctx.user.id);
            try {
                const result = yield udb.query(sql, allParams);
                yield udb.commit();
                return result.rows;
            }
            catch (error) {
                yield udb.rollback();
                throw new Error(`RLS Fetch error for '${schemaName}.${tableName}': ${error.message}`);
            }
            finally {
                udb.release();
            }
        }
        const result = yield db_1.db.query(sql, allParams);
        return result.rows;
    })),
    /**
     * Query: 獲取單筆資料
     */
    get: trpc_1.procedure
        .input(DocInput)
        .query((_a) => __awaiter(void 0, [_a], void 0, function* ({ input, ctx }) {
        const { tableName, schemaName, id, idField } = input;
        const sql = `SELECT * FROM "${schemaName}"."${tableName}" WHERE "${idField}" = $1 LIMIT 1;`;
        if (ctx.user) {
            const udb = yield db_1.db.withUser(ctx.user.id);
            try {
                const result = yield udb.query(sql, [id]);
                yield udb.commit();
                return result.rows[0] || null;
            }
            catch (error) {
                yield udb.rollback();
                throw new Error(`RLS Get error for ${schemaName}.${tableName}/${id}: ${error.message}`);
            }
            finally {
                udb.release();
            }
        }
        const result = yield db_1.db.query(sql, [id]);
        return result.rows[0] || null;
    })),
    /**
     * Mutation: 新增資料
     */
    add: trpc_1.procedure
        .input(WriteInput)
        .mutation((_a) => __awaiter(void 0, [_a], void 0, function* ({ input, ctx }) {
        const { tableName, schemaName, record } = input;
        const { columns, placeholders, params } = prepareWrite(record, 1);
        const sql = `INSERT INTO "${schemaName}"."${tableName}" (${columns}) VALUES (${placeholders}) RETURNING *;`;
        if (ctx.user) {
            const udb = yield db_1.db.withUser(ctx.user.id);
            try {
                const result = yield udb.query(sql, params);
                yield udb.commit();
                return result.rows[0];
            }
            catch (error) {
                yield udb.rollback();
                throw new Error(`RLS Add error for '${schemaName}.${tableName}': ${error.message}`);
            }
            finally {
                udb.release();
            }
        }
        const result = yield db_1.db.query(sql, params);
        return result.rows[0];
    })),
    /**
     * Mutation: 更新資料
     */
    update: trpc_1.procedure
        .input(UpdateInput)
        .mutation((_a) => __awaiter(void 0, [_a], void 0, function* ({ input, ctx }) {
        const { tableName, schemaName, id, idField, record } = input;
        const { setClause, params, lastIndex } = prepareUpdate(record, 1);
        const sql = `UPDATE "${schemaName}"."${tableName}" SET ${setClause} WHERE "${idField}" = $${lastIndex} RETURNING *;`;
        const allParams = [...params, id];
        if (ctx.user) {
            const udb = yield db_1.db.withUser(ctx.user.id);
            try {
                const result = yield udb.query(sql, allParams);
                yield udb.commit();
                return result.rows[0] || null;
            }
            catch (error) {
                yield udb.rollback();
                throw new Error(`RLS Update error for '${schemaName}.${tableName}': ${error.message}`);
            }
            finally {
                udb.release();
            }
        }
        const result = yield db_1.db.query(sql, allParams);
        return result.rows[0] || null;
    })),
    /**
     * Mutation: 刪除資料
     */
    delete: trpc_1.procedure
        .input(DocInput)
        .mutation((_a) => __awaiter(void 0, [_a], void 0, function* ({ input, ctx }) {
        const { tableName, schemaName, id, idField } = input;
        const sql = `DELETE FROM "${schemaName}"."${tableName}" WHERE "${idField}" = $1 RETURNING *;`;
        if (ctx.user) {
            const udb = yield db_1.db.withUser(ctx.user.id);
            try {
                const result = yield udb.query(sql, [id]);
                yield udb.commit();
                return result.rows[0] || null;
            }
            catch (error) {
                yield udb.rollback();
                throw new Error(`RLS Delete error for '${schemaName}.${tableName}': ${error.message}`);
            }
            finally {
                udb.release();
            }
        }
        const result = yield db_1.db.query(sql, [id]);
        return result.rows[0] || null;
    })),
});
