const test = require("node:test");
const assert = require("node:assert");
const { Collection, Query, Document } = require("../src/client/index.js");

const userConverter = {
  fromFirestore(row) {
    return {
      id: row.id,
      displayName: row.name,
      upperRole: String(row.role || "").toUpperCase(),
    };
  },
  toFirestore(model) {
    return {
      name: model.displayName,
      role: (model.upperRole || "").toLowerCase(),
    };
  },
};

function createSdkMock() {
  const state = {
    lastAddInput: null,
    lastUpdateInput: null,
    lastSetInput: null,
  };

  const sdk = {
    data: {
      list: {
        query: async () => [
          { id: 1, name: "ray", role: "admin" },
          { id: 2, name: "bird", role: "editor" },
        ],
      },
      get: {
        query: async () => ({ id: 1, name: "ray", role: "admin" }),
      },
      add: {
        mutate: async (input) => {
          state.lastAddInput = input;
          return { id: 99, ...input.record };
        },
      },
      update: {
        mutate: async (input) => {
          state.lastUpdateInput = input;
          return { id: input.id, ...input.record };
        },
      },
      set: {
        mutate: async (input) => {
          state.lastSetInput = input;
          return { id: input.id, ...input.record };
        },
      },
      delete: {
        mutate: async () => ({ id: 1, name: "ray", role: "admin" }),
      },
    },
    onDbEvent: {
      subscribe: () => ({
        unsubscribe: () => {},
      }),
    },
  };

  return { sdk, state };
}

test("Query.withConverter().get() 會回傳轉換後模型", async () => {
  const { sdk } = createSdkMock();
  const query = new Query("users", sdk).withConverter(userConverter);

  const rows = await query.get();
  assert.deepStrictEqual(rows[0], {
    id: 1,
    displayName: "ray",
    upperRole: "ADMIN",
  });
});

test("Collection.withConverter().add() 會套用 toFirestore", async () => {
  const { sdk, state } = createSdkMock();
  const users = new Collection("users", sdk).withConverter(userConverter);

  await users.add({ displayName: "Neo", upperRole: "OWNER" });
  assert.deepStrictEqual(state.lastAddInput.record, {
    name: "Neo",
    role: "owner",
  });
});

test("Document.withConverter() 會套用 get/update/set/delete 轉換", async () => {
  const { sdk, state } = createSdkMock();
  const doc = new Document("users", 1, sdk).withConverter(userConverter);

  const current = await doc.get();
  assert.deepStrictEqual(current, {
    id: 1,
    displayName: "ray",
    upperRole: "ADMIN",
  });

  const updated = await doc.update({
    displayName: "Ray Bird",
    upperRole: "EDITOR",
  });
  assert.deepStrictEqual(state.lastUpdateInput.record, {
    name: "Ray Bird",
    role: "editor",
  });
  assert.deepStrictEqual(updated, {
    id: 1,
    displayName: "Ray Bird",
    upperRole: "EDITOR",
  });

  await doc.set({ displayName: "Ray", upperRole: "ADMIN" }, { merge: true });
  assert.deepStrictEqual(state.lastSetInput.record, {
    name: "Ray",
    role: "admin",
  });

  const deleted = await doc.delete();
  assert.deepStrictEqual(deleted, {
    id: 1,
    displayName: "ray",
    upperRole: "ADMIN",
  });
});
