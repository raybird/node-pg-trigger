import { router, procedure } from "../trpc";
import { db } from "../lib/db";
import { z } from "zod";

export const healthRouter = router({
  check: procedure.query(async () => {
    try {
      await db.query("SELECT 1");
      return { status: "ok", db: "connected", timestamp: new Date().toISOString() };
    } catch (e) {
      return { status: "error", db: "disconnected" };
    }
  }),
});
