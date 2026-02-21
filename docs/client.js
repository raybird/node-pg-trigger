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
const client_1 = require("@trpc/client");
const wsClient = (0, client_1.createWSClient)({
    url: `ws://${window.location.host}`,
});
const trpc = (0, client_1.createTRPCProxyClient)({
    links: [
        (0, client_1.wsLink)({
            client: wsClient,
        }),
    ],
});
const notificationsDiv = document.getElementById('notifications');
function displayNotification(data) {
    if (notificationsDiv.innerHTML.includes('Waiting for events...')) {
        notificationsDiv.innerHTML = '';
    }
    const notificationElement = document.createElement('pre');
    notificationElement.innerHTML = JSON.stringify(data, null, 2);
    notificationsDiv.prepend(notificationElement);
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Connecting to server...');
        // 修正：使用正確的 subscription 名稱 onDbEvent
        trpc.onDbEvent.subscribe(undefined, {
            onStarted() {
                console.log('Subscription started');
                displayNotification({ status: 'Subscribed and waiting for events...' });
            },
            onData(data) {
                console.log('Received data:', data);
                displayNotification(data);
            },
            onError(err) {
                console.error('Subscription error:', err);
                displayNotification({ error: 'Subscription failed', message: err.message });
            },
        });
    });
}
main();
