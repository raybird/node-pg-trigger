import { Pool } from 'pg';
import { EventEmitter } from 'events';

export class DbEventEmitter extends EventEmitter {
  private client: Pool;

  constructor(client: Pool) {
    super();
    this.client = client;
    this.listen();
  }

  private async listen() {
    const client = await this.client.connect();
    client.query('LISTEN db_events');
    client.on('notification', (msg) => {
      if (msg.channel === 'db_events') {
        try {
          const payload = JSON.parse(msg.payload || '{}');
          this.emit('dbEvent', payload);
        } catch (error) {
          console.error('Error parsing notification payload:', error);
        }
      }
    });
    console.log('Listening for db_events notifications...');
  }
}
