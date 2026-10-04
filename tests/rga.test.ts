import { describe, expect, it } from "vitest";
import { RGA } from "../src/crdt/rga";
import { InMemoryOperationStore } from "../src/server/memory-operation-store";
import { InMemoryDocumentStore } from "../src/server/memory-document-store";
import { Room } from "../src/server/room";
import type WebSocket from "ws";

const insertOperation = (id: string, value: string, after: string | null) => ({
  type: "insert" as const,
  id,
  element: { id, value, after, deleted: false },
});

describe("RGA", () => {
  it("can insert text", () => {
    const alice = new RGA("alice");

    alice.insert("H", null);

    expect(alice.getText()).toBe("H");
  });
});

it("can insert multiple elements", () => {
  const alice = new RGA("alice");

  const h = alice.insert("H", null);
  const e = alice.insert("E", h.element.id);
  alice.insert("L", e.element.id);

  expect(alice.getText()).toBe("HEL");
});

it("converges when two clients insert after the same element", () => {
  const alice = new RGA("alice");
  const bob = new RGA("bob");

  const a = alice.insert("A", null);

  // Bob needs to know about A.
  bob.apply(a);

  // Both clients independently insert after A.
  const x = alice.insert("X", a.element.id);

  const y = bob.insert("Y", a.element.id);

  // Exchange operations.
  bob.apply(x);

  alice.apply(y);

  expect(alice.getText()).toBe(bob.getText());
});

it("converges regardless of operation delivery order", () => {
  const alice = new RGA("alice");
  const bob = new RGA("bob");

  const root = alice.insert("A", null);

  bob.apply(root);

  const x = alice.insert("X", root.element.id);
  const y = bob.insert("Y", root.element.id);

  // Alice receives Y.
  alice.apply(y);

  // Bob receives X.
  bob.apply(x);

  expect(alice.getText()).toBe(bob.getText());
});

it("uses deterministic ordering for concurrent inserts", () => {
  const alice = new RGA("alice");
  const bob = new RGA("bob");

  // Both clients start with A.
  const a = alice.insert("A", null);

  bob.apply(a);

  // Concurrent inserts.
  const x = alice.insert("X", a.element.id);
  const y = bob.insert("Y", a.element.id);

  // Alice receives Y.
  alice.apply(y);

  // Bob receives X.
  bob.apply(x);

  expect(alice.getText()).toBe("AXY");
  expect(bob.getText()).toBe("AXY");
});

it("converges when operations arrive in opposite orders", () => {
  const alice = new RGA("alice");
  const bob = new RGA("bob");

  const a = alice.insert("A", null);

  const operationA = a;

  bob.apply(operationA);

  const x = alice.insert("X", a.element.id);
  const y = bob.insert("Y", a.element.id);

  const operationX = x;
  const operationY = y;

  // Alice receives Y first.
  alice.apply(operationY);

  // Bob receives X first.
  bob.apply(operationX);

  expect(alice.getText()).toBe("AXY");
  expect(bob.getText()).toBe("AXY");
});

it("ignores duplicate insert operations", () => {
  const alice = new RGA("alice");

  const x = alice.insert("X", null);

  const operation = x;

  alice.apply(operation);
  alice.apply(operation);

  expect(alice.getText()).toBe("X");
});

it("keeps deleted elements as tombstones", () => {
  const alice = new RGA("alice");

  const a = alice.insert("A", null);
  const b = alice.insert("B", a.element.id);
  alice.insert("C", b.element.id);

  alice.delete(b.element.id);

  expect(alice.getText()).toBe("AC");
});

it("handles an insert that arrives before its dependency", () => {
  const alice = new RGA("alice");
  const bob = new RGA("bob");

  const a = alice.insert("A", null);

  bob.apply(a)

  const x = alice.insert("X", a.element.id);

  const y = alice.insert("Y", x.element.id);

  const operationX = x;
  const operationY = y;

  // DELIBERATELY WRONG ORDER.
  bob.apply(operationY);
  bob.apply(operationX);

  expect(bob.getText()).toBe("AXY");
});

it("handles delete arriving before the element", () => {
  const alice = new RGA("alice");
  const bob = new RGA("bob");

  const a = alice.insert("A", null);

  bob.apply(a);

  const b = alice.insert("B", a.element.id);

  // Bob receives DELETE before INSERT.
  bob.apply({
    type: "delete",
    id: b.element.id,
    target: b.element.id,
  });

  bob.apply(b);

  expect(bob.getText()).toBe("A");
});

it("can serialize and restore its state", () => {
    const original = new RGA("client-1");

    original.insert("H", null);

    const hId = {
        clientId: "client-1",
        sequence: 1,
    };

    original.insert("i", hId);

    const state = original.serialize();

    const restored = new RGA("restored-client");

    restored.restore(state);

    expect(restored.getText()).toBe("Hi");
});

it("preserves deleted elements during restore", () => {
    const original = new RGA("client-1");

    original.insert("H", null);

    const hId = {
        clientId: "client-1",
        sequence: 1,
    };

    original.insert("i", hId);

    original.delete(hId);

    const state = original.serialize();

    const restored = new RGA("restored-client");

    restored.restore(state);

    expect(restored.getText()).toBe("i");
});

it("advances the version vector when applying a remote operation", () => {
  const rga = new RGA("client-b");

  const operation = {
    type: "insert" as const,
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
  };

  rga.apply(operation);

  console.log("elements", rga.serialize().versionVector)

  expect(rga.serialize().versionVector).toEqual({
    "client-a": 1,
  });
});

it("advances the version vector when applying a remote delete", () => {
  const rga = new RGA("client-b");

  const insert = {
    type: "insert" as const,
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
  };

  rga.apply(insert);

  const deleteOperation = {
    type: "delete" as const,
    id: {
      clientId: "client-a",
      sequence: 2,
    },
    target: {
      clientId: "client-a",
      sequence: 1,
    },
  };

  rga.apply(deleteOperation);

  expect(rga.serialize().versionVector).toEqual({
    "client-a": 2,
  });

  
});

it("restores the version vector from a snapshot and later operations", async () => {
  const operationStore = new InMemoryOperationStore();
  const documentStore = new InMemoryDocumentStore();

  const firstRoom = new Room(
    "version-vector-doc",
    new RGA("server"),
    operationStore,
    documentStore,
  );

  const sender = {} as WebSocket;

  const operation1 = {
    type: "insert" as const,
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
  };

  const operation2 = {
    type: "insert" as const,
    id: {
      clientId: "client-a",
      sequence: 2,
    },
    element: {
      id: {
        clientId: "client-a",
        sequence: 2,
      },
      value: "i",
      after: {
        clientId: "client-a",
        sequence: 1,
      },
      deleted: false,
    },
  };

  await firstRoom.handleOperation(operation1, sender);
  await firstRoom.handleOperation(operation2, sender);

  const snapshot = firstRoom["rga"].serialize();

  await documentStore.saveSnapshot({
    documentId: "version-vector-doc",
    state: snapshot,
    version: 1,
  });

  const restoredRoom = new Room(
    "version-vector-doc",
    new RGA("server"),
    operationStore,
    documentStore,
  );

  await restoredRoom.restore();

  expect(restoredRoom.getText()).toBe("Hi");
  expect(restoredRoom.getVersionVector()).toEqual({
  "client-a": 2,
});

});

it("returns elements in CRDT order", () => {
  const rga = new RGA("client-a");

  const first = rga.insert("A", null);

  const second = rga.insert("B", first.id);

  const third = rga.insert("C", second.id);

  expect(
    rga.getElements().map((element) => element.value)
  ).toEqual(["A", "B", "C"]);
});

it("does not return deleted elements", () => {
  const rga = new RGA("client-a");

  const first = rga.insert("A", null);

  rga.insert("B", first.id);

  rga.delete(first.id);

  expect(
    rga.getElements().map((element) => element.value)
  ).toEqual(["B"]);
});

it("returns children of deleted elements", () => {
  const rga = new RGA("client-a");

  const first = rga.insert("A", null);

  const second = rga.insert("B", first.id);

  rga.delete(first.id);

  expect(
    rga.getElements().map((element) => element.value)
  ).toEqual(["B"]);

  expect(second.element.after).toEqual(first.id);
});