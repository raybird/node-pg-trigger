import { createTRPCProxyClient, createWSClient, wsLink } from '@trpc/client';
import type { AppRouter } from '../src/server/router';

const wsClient = createWSClient({
  url: `ws://${window.location.host}`,
});

const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    wsLink({
      client: wsClient,
    }),
  ],
});

const notificationsDiv = document.getElementById('notifications') as HTMLDivElement;

function displayNotification(data: any) {
    if (notificationsDiv.innerHTML.includes('Waiting for events...')) {
        notificationsDiv.innerHTML = '';
    }
    const notificationElement = document.createElement('pre');
    notificationElement.innerHTML = JSON.stringify(data, null, 2);
    notificationsDiv.prepend(notificationElement);
}

async function main() {
  console.log('Connecting to server...');
  
  trpc.trigger.onNew.subscribe(undefined, {
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
}

main();