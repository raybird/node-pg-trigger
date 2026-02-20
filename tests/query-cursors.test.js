const test = require("node:test");
const assert = require("node:assert");
const { Query } = require("../src/client/index.js");

function createSdkMock(initialRows) {
  const state = {
    handlers: null,
  };

  const sdk = {
    data: {
      list: {
        query: async () => initialRows,
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

test("Query.startAfter() 與 endAt() 可限制查詢窗口", async () => {
  const { sdk } = createSdkMock([
    { id: 1, score: 10 },
    { id: 2, score: 20 },
    { id: 3, score: 30 },
    { id: 4, score: 40 },
  ]);

  const rows = await new Query("users", sdk)
    .orderBy("score", "asc")
    .startAfter(10)
    .endAt(30)
    .get();

  assert.deepStrictEqual(
    rows.map((row) => row.id),
    [2, 3],
  );
});

test("Query.startAt() 未搭配 orderBy 應拋錯", async () => {
  const { sdk } = createSdkMock([{ id: 1, score: 10 }]);

  await assert.rejects(async () => {
    await new Query("users", sdk).startAt(10).get();
  }, /startAt\/startAfter\/endAt\/endBefore 需要至少一個 orderBy\(\)/);
});

test("onSnapshot 事件更新後仍套用 startAfter 游標條件", async () => {
  const { sdk, state } = createSdkMock([
    { id: 1, score: 10 },
    { id: 2, score: 20 },
    { id: 3, score: 30 },
  ]);

  const query = new Query("users", sdk).orderBy("score", "asc").startAfter(20);

  const snapshots = [];
  await query.onSnapshot((snapshot) => {
    snapshots.push(snapshot.record.map((row) => row.id));
  });

  state.handlers.onData({
    timestamp: new Date().toISOString(),
    txid: 301,
    action: "insert",
    schema: "public",
    table: "users",
    record: { id: 4, score: 25 },
    old_record: null,
  });

  state.handlers.onData({
    timestamp: new Date().toISOString(),
    txid: 302,
    action: "insert",
    schema: "public",
    table: "users",
    record: { id: 5, score: 35 },
    old_record: null,
  });

  assert.deepStrictEqual(snapshots[0], [3]);
  assert.deepStrictEqual(snapshots[1], [4, 3]);
  assert.deepStrictEqual(snapshots[2], [4, 3, 5]);
});
