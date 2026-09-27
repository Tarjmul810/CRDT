import { describe, expect, it } from "vitest";
import { SyncState } from "../src/client/sync-state";

describe("SyncState", () => {
  it("applies synchronized operations and updates its version vector", () => {
    const state = new SyncState("client-b");

    state.applyOperation({
      type: "insert",
      id: {
        clientId: "client-a",
        sequence: 1,
      },
      element: {
        id: {
          clientId: "client-a",
          sequence: 1,
        },
        value: "H",
        after: null,
        deleted: false,
      },
    });

    expect(state.getText()).toBe("H");

    expect(state.getVersionVector()).toEqual({
      "client-a": 1,
    });
  });

  it("creates local operations and advances its version vector", () => {
  const state = new SyncState("client-a");

  const operation = state.insert("H", null);

  expect(operation.type).toBe("insert");
  expect(operation.id).toEqual({
    clientId: "client-a",
    sequence: 1,
  });

  expect(state.getText()).toBe("H");

  expect(state.getVersionVector()).toEqual({
    "client-a": 1,
  });
});

it("creates sequential local operations", () => {
  const state = new SyncState("client-a");

  const first = state.insert("H", null);

  const second = state.insert("i", first.id);

  expect(second.id).toEqual({
    clientId: "client-a",
    sequence: 2,
  });

  expect(state.getText()).toBe("Hi");

  expect(state.getVersionVector()).toEqual({
    "client-a": 2,
  });
});
});