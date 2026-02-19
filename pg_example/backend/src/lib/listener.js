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
exports.DbEventEmitter = void 0;
const events_1 = require("events");
class DbEventEmitter extends events_1.EventEmitter {
    constructor(client) {
        super();
        this.client = client;
        this.listen();
    }
    listen() {
        return __awaiter(this, void 0, void 0, function* () {
            const client = yield this.client.connect();
            client.query('LISTEN db_events');
            client.on('notification', (msg) => {
                if (msg.channel === 'db_events') {
                    try {
                        const payload = JSON.parse(msg.payload || '{}');
                        this.emit('dbEvent', payload);
                    }
                    catch (error) {
                        console.error('Error parsing notification payload:', error);
                    }
                }
            });
            console.log('Listening for db_events notifications...');
        });
    }
}
exports.DbEventEmitter = DbEventEmitter;
