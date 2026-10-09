import { describe, expect, it } from "vitest";
import { SyncState } from "../src/client/sync-state";
import type { Operation } from "../src/crdt/type";

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

it("does not acknowledge a local operation before server confirmation", () => {
  const state = new SyncState("client-a");

  const operation = state.insert(
    "H",
    null,
  );

  expect(
    state.getVersionVector(),
  ).toEqual({
    "client-a": 1,
  });

  expect(
    state.getAcknowledgedVersionVector(),
  ).toEqual({});
});

it("acknowledges a local operation after server confirmation", () => {
  const state = new SyncState("client-a");

  const operation = state.insert(
    "H",
    null,
  );

  state.acknowledgeOperation(
    operation.id,
  );

  expect(
    state.getVersionVector(),
  ).toEqual({
    "client-a": 1,
  });

  expect(
    state.getAcknowledgedVersionVector(),
  ).toEqual({
    "client-a": 1,
  });
});

it("acknowledges remotely received operations", () => {
  const state = new SyncState("client-a");

  const remoteOperation: Operation = {
    type: "insert",
    id: {
      clientId: "client-b",
      sequence: 1,
    },
    element: {
      id: {
        clientId: "client-b",
        sequence: 1,
      },
      value: "X",
      after: null,
      deleted: false,
    },
  };

  state.applyOperation(remoteOperation);
  state.acknowledgeOperation(
    remoteOperation.id,
  );

  expect(
    state.getAcknowledgedVersionVector(),
  ).toEqual({
    "client-b": 1,
  });
});
it("serializes and restores document state", () => {
  const state1 = new SyncState("client-a");

  state1.insert("H", null);

  const serialized = state1.serialize();

  const state2 = new SyncState("client-a");

  state2.restore(serialized);

  expect(state2.getText()).toBe("H");

  expect(state2.getVersionVector()).toEqual({
    "client-a": 1,
  });
});
});