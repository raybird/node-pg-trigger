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
exports.healthRouter = void 0;
const trpc_1 = require("../trpc");
const db_1 = require("../lib/db");
exports.healthRouter = (0, trpc_1.router)({
    check: trpc_1.procedure.query(() => __awaiter(void 0, void 0, void 0, function* () {
        try {
            yield db_1.db.query("SELECT 1");
            return { status: "ok", db: "connected", timestamp: new Date().toISOString() };
        }
        catch (e) {
            return { status: "error", db: "disconnected" };
        }
    })),
});
