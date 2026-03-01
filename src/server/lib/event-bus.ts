import { EventEmitter } from 'events';
import { TriggerPayload } from './types';

/**
 * Node-PG-Trigger Event Bus (v1.2.0 - Typed)
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  public publish(payload: TriggerPayload) {
    console.log(`[Bus] Processing ${payload.action} on ${payload.table}`);
    this.emit('db_event', payload);
    this.emit(`${payload.table}:${payload.action}`, payload);
  }

  public subscribe(callback: (payload: TriggerPayload) => void) {
    this.on('db_event', callback);
  }

  public onTableEvent(table: string, action: TriggerPayload['action'], callback: (payload: TriggerPayload) => void) {
    this.on(`${table}:${action}`, callback);
  }
}

export const eventBus = new EventBus();
