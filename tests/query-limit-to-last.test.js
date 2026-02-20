const test = require("node:test");
const assert = require("node:assert");
const { Query } = require("../src/client/index.js");

function createSdkMock(initialRows) {
  const state = {
    listCalls: [],
    handlers: null,
  };

  const sdk = {
    data: {
      list: {
        query: async (input) => {
          state.listCalls.push(input);
          return initialRows;
        },
      },
    },
    onDbEvent: {
      subscribe: (_input, handlers) => {
        state.handlers = handlers;
        return { unsubscribe: () => {} };
      },
    },
  };

  return { sdk, state };
}

test("Query.limitToLast() 會回傳最後 N 筆且維持排序", async () => {
  const { sdk } = createSdkMock([
    { id: 4, score: 40 },
    { id: 2, score: 30 },
  ]);

  const query = new Query("users", sdk).orderBy("score", "asc").limitToLast(2);

  const rows = await query.get();
  assert.deepStrictEqual(
    rows.map((row) => row.id),
    [2, 4],
  );
});

test("Query.limitToLast() 未搭配 orderBy 應拋錯", async () => {
  const { sdk } = createSdkMock([{ id: 1 }]);
  const query = new Query("users", sdk).limitToLast(1);

  await assert.rejects(async () => {
    await query.get();
  }, /limitToLast\(\) 需要至少一個 orderBy\(\)/);
});

test("onSnapshot 在事件更新後仍維持 limitToLast 窗口", async () => {
  const { sdk, state } = createSdkMock([
    { id: 4, score: 40 },
    { id: 2, score: 30 },
  ]);

  const query = new Query("users", sdk).orderBy("score", "asc").limitToLast(2);

  const snapshots = [];
  await query.onSnapshot((snapshot) => {
    snapshots.push(snapshot.record.map((row) => row.id));
  });

  state.handlers.onData({
    timestamp: new Date().toISOString(),
    txid: 101,
    action: "update",
    schema: "public",
    table: "users",
    record: { id: 3, score: 50 },
    old_record: { id: 3, score: 20 },
  });

  assert.deepStrictEqual(snapshots[0], [2, 4]);
  assert.deepStrictEqual(snapshots[1], [4, 3]);
});
