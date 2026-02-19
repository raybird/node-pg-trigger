import { inferAsyncReturnType } from '@trpc/server';
import { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import { db } from './lib/db';

type CreateContextOptions = CreateExpressContextOptions | CreateWSSContextFnOptions;

export async function createContext(opts: CreateContextOptions) {
  return { db };
}

export type Context = inferAsyncReturnType<typeof createContext>;
