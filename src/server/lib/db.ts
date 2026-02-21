import { Pool, QueryResultRow } from 'pg';

// 從環境變數中讀取資料庫連線設定
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT, 10) : 5432,
});

export const db = {
  /**
   * 一般查詢
   */
  query: <T extends QueryResultRow>(text: string, params?: any[]) => pool.query<T>(text, params),

  /**
   * 具備使用者 Context 的查詢 (用於 RLS)
   */
  withUser: async (userId: string) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 設定 PG Session 變數，供 RLS Policy 使用
      // 使用 "request.user_id" 作為約定名稱
      await client.query(`SET LOCAL "request.user_id" = $1`, [userId]);
      
      return {
        query: <T extends QueryResultRow>(text: string, params?: any[]) => client.query<T>(text, params),
        commit: () => client.query('COMMIT'),
        rollback: () => client.query('ROLLBACK'),
        release: () => client.release(),
      };
    } catch (err) {
      client.release();
      throw err;
    }
  },

  /**
   * 檢查特定記錄是否符合使用者的 RLS 權限
   */
  checkRls: async (userId: string, tableName: string, record: any, idField: string = 'id'): Promise<boolean> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL "request.user_id" = $1`, [userId]);
      
      // 這裡我們透過查詢該 ID 是否存在來測試 RLS
      // 如果 RLS policy 過濾掉，則會回傳 0 筆
      const idValue = record[idField];
      if (idValue === undefined) return true; // 無法檢查則預設通過 (或可改為嚴格模式)

      const sql = `SELECT 1 FROM "${tableName}" WHERE "${idField}" = $1 LIMIT 1;`;
      const result = await client.query(sql, [idValue]);
      
      await client.query('COMMIT');
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[RLS Check Error]', err);
      return false;
    } finally {
      client.release();
    }
  }
};
