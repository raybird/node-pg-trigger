import { eventBus } from '../src/server/lib/event-bus';
import { TriggerPayload } from '../src/server/lib/types';

/**
 * Node-PG-Trigger Event Bus 測試 (v1.3.0)
 */
async function testEventBus() {
  console.log('🧪 正在測試強型別 Event Bus...');

  const mockPayload: TriggerPayload = {
    timestamp: new Date().toISOString(),
    txid: '12345',
    action: 'insert',
    schema: 'public',
    table: 'users',
    record: { id: 1, name: 'Raybird' },
    old_record: null
  };

  let receivedCount = 0;

  // 1. 測試全域訂閱
  eventBus.subscribe((payload) => {
    receivedCount++;
    console.log('✅ 全域訂閱成功接收事件');
  });

  // 2. 測試特定資料表訂閱
  eventBus.onTableEvent('users', 'insert', (payload) => {
    receivedCount++;
    console.log('✅ 特定資料表訂閱成功接收事件');
  });

  // 發布事件
  eventBus.publish(mockPayload);

  // 驗證
  if (receivedCount === 2) {
    console.log('
🏆 Event Bus 測試通過！型別校驗與分發邏輯正常。');
    process.exit(0);
  } else {
    console.error(`
❌ 測試失敗：預期接收 2 個事件，實際接收 ${receivedCount} 個。`);
    process.exit(1);
  }
}

testEventBus().catch(e => {
  console.error(e);
  process.exit(1);
});
