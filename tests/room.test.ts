import {
  describe,
  expect,
  it,
} from "vitest";

import WebSocket from "ws";

import { RGA } from "../src/crdt/rga";
import { Room } from "../src/server/room";
import { InMemoryOperationStore } from "../src/server/memory-operation-store";
import { InMemoryDocumentStore } from "../src/server/memory-document-store";

function createSender(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: () => {},
  } as unknown as WebSocket;
}

describe("Room", () => {
  it("persists an accepted operation", async () => {
    const operationStore =
      new InMemoryOperationStore();

    const documentStore =
      new InMemoryDocumentStore();

    const rga = new RGA("client-1");

    const room = new Room(
      "doc-1",
      rga,
      operationStore,
      documentStore
    );

    const sender = createSender();

    const operation = rga.insert(
      "A",
      null
    );

    await room.handleOperation(
      operation,
      sender
    );

    const stored =
      await operationStore.getOperations(
        "doc-1"
      );

    expect(stored).toHaveLength(1);

    expect(
      stored[0]?.operation
    ).toEqual(operation);

    expect(room.getText()).toBe("A");
  });

  it("creates a snapshot at the snapshot interval", async () => {
    const operationStore =
      new InMemoryOperationStore();

    const documentStore =
      new InMemoryDocumentStore();

    const rga = new RGA("client-1");

    const room = new Room(
      "doc-1",
      rga,
      operationStore,
      documentStore
    );

    const sender = createSender();

    for (let i = 0; i < 100; i++) {
      const operation = rga.insert(
        String.fromCharCode(
          65 + (i % 26)
        ),
        null
      );

      await room.handleOperation(
        operation,
        sender
      );
    }

    const snapshot =
      await documentStore.getSnapshot(
        "doc-1"
      );

    expect(snapshot).not.toBeNull();

    expect(
      snapshot!.version
    ).toBe(100);

    expect(
      snapshot!.state.elements
    ).toHaveLength(100);
  });

  it("restores a room from a snapshot and later operations", async () => {
  const operationStore =
    new InMemoryOperationStore();

  const documentStore =
    new InMemoryDocumentStore();

  const originalRga =
    new RGA("client-1");

  const originalRoom = new Room(
    "doc-1",
    originalRga,
    operationStore,
    documentStore
  );

  const sender = createSender();

  for (let i = 0; i < 100; i++) {
    const operation = originalRga.insert(
      String.fromCharCode(
        65 + (i % 26)
      ),
      null
    );

    await originalRoom.handleOperation(
      operation,
      sender
    );
  }

  expect(
    await documentStore.getSnapshot("doc-1")
  ).not.toBeNull();

  // Operation 101 happens after the snapshot.
  const operation101 =
    originalRga.insert("Z", null);

  await originalRoom.handleOperation(
    operation101,
    sender
  );

  const expectedText =
    originalRoom.getText();

  // Simulate a new Room instance.
  const restoredRga =
    new RGA("restored-client");

  const restoredRoom = new Room(
    "doc-1",
    restoredRga,
    operationStore,
    documentStore
  );

  await restoredRoom.restore();

  expect(
    restoredRoom.getText()
  ).toBe(expectedText);
});

it("restores only operations after the snapshot version", async () => {
  const operationStore =
    new InMemoryOperationStore();

  const documentStore =
    new InMemoryDocumentStore();

  const originalRga =
    new RGA("client-1");

  const room = new Room(
    "doc-1",
    originalRga,
    operationStore,
    documentStore
  );

  const sender = createSender();

  for (let i = 0; i < 100; i++) {
    const operation = originalRga.insert(
      String.fromCharCode(
        65 + (i % 26)
      ),
      null
    );

    await room.handleOperation(
      operation,
      sender
    );
  }

  const snapshot =
    await documentStore.getSnapshot(
      "doc-1"
    );

  expect(snapshot!.version).toBe(100);

  const operation101 =
    originalRga.insert("Z", null);

  await room.handleOperation(
    operation101,
    sender
  );

  const operations =
    await operationStore.getOperations(
      "doc-1",
      snapshot!.version
    );

  expect(operations).toHaveLength(1);

  expect(
    operations[0]?.version
  ).toBe(101);

  expect(
    operations[0]?.operation
  ).toEqual(operation101);
});
});