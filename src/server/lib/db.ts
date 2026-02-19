import { Pool, PoolClient } from 'pg';

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
  query: <T>(text: string, params?: any[]) => pool.query<T>(text, params),

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
        query: <T>(text: string, params?: any[]) => client.query<T>(text, params),
        commit: () => client.query('COMMIT'),
        rollback: () => client.query('ROLLBACK'),
        release: () => client.release(),
      };
    } catch (err) {
      client.release();
      throw err;
    }
  }
};
