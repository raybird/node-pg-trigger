const test = require("node:test");
const assert = require("node:assert");
const { Query, Document } = require("../src/client/index.js");

function createSdkMock({ listRows = [], getRow = null } = {}) {
  return {
    data: {
      list: {
        query: async () => listRows,
      },
      get: {
        query: async () => getRow,
      },
    },
    onDbEvent: {
      subscribe: () => ({ unsubscribe: () => {} }),
    },
  };
}

test("Query.count() 會回傳查詢結果數量", async () => {
  const sdk = createSdkMock({
    listRows: [
      { id: 1, score: 10 },
      { id: 2, score: 20 },
      { id: 3, score: 30 },
    ],
  });

  const count = await new Query("users", sdk).where("score", ">", 5).count();
  assert.strictEqual(count, 3);
});

test("Document.exists() 在文件存在時回傳 true", async () => {
  const sdk = createSdkMock({ getRow: { id: 1, name: "ray" } });
  const exists = await new Document("users", 1, sdk).exists();
  assert.strictEqual(exists, true);
});

test("Document.exists() 在文件不存在時回傳 false", async () => {
  const sdk = createSdkMock({ getRow: null });
  const exists = await new Document("users", 999, sdk).exists();
  assert.strictEqual(exists, false);
});
