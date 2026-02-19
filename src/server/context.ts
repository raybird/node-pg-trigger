import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';

/**
 * 定義使用者介面
 */
export interface User {
  id: string;
}

/**
 * 定義 tRPC context。
 */
export const createContext = ({ req, res }: CreateExpressContextOptions | CreateWSSContextFnOptions) => {
  // 從 headers 提取使用者資訊 (模擬 JWT 驗證)
  // 格式: Authorization: Bearer <user_id>
  const authHeader = req.headers.authorization;
  let user: User | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const userId = authHeader.split(' ')[1];
    if (userId) {
      user = { id: userId };
    }
  }

  return {
    user,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
