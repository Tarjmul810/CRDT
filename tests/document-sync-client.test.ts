import { describe, expect, it, vi } from "vitest";
import { DocumentSyncClient } from "../src/client/document-sync-client";
import { DocumentSession } from "../src/document/document-session";
import type { InsertBlockOperation } from "../src/document/operations";
import { InMemoryLocalStore } from "../src/client/memory-local-store";

function createMockSocket() {
  const listeners = new Map<string, ((...args: any[]) => void)[]>();

  return {
    readyState: 1,
    send: vi.fn(),
    on(event: string, callback: (...args: any[]) => void) {
      const existing = listeners.get(event) ?? [];
      existing.push(callback);
      listeners.set(event, existing);
    },

    off(event: string, callback: (...args: any[]) => void) {
      const existing = listeners.get(event) ?? [];
      listeners.set(
        event,
        existing.filter((listener) => listener !== callback),
      );
    },

    emit(event: string, ...args: any[]) {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
    },
  };
}

function createInsertBlockOperation(
  sequence: number,
  clientId = "client-a",
): InsertBlockOperation {
  return {
    type: "insert_block",
    id: {
      clientId,
      sequence,
    },
    block: {
      id: `block-${sequence}`,
      type: "paragraph",
    },
    after: null,
  };
}

describe("DocumentSyncClient", async() => {
  it("applies an incoming document operation", () => {
    const socket = createMockSocket();
    const session = new DocumentSession("client-a");
    const localStore = new InMemoryLocalStore();

    const client = new DocumentSyncClient(
      socket as any,
      session,
      "document-1",
      localStore,
    );

    const operation = createInsertBlockOperation(1, "client-b");

    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "document_operation",
          operation,
        }),
      ),
    );

    expect(session.serialize().blockList.elements).toHaveLength(1);

    expect(JSON.parse(session.serialize().blockList.elements[0].value)).toEqual(
      operation.block,
    );
  });

  it("removes an acknowledged operation from pending", async() => {
    const socket = createMockSocket();
    const session = new DocumentSession("client-a");
    const localStore = new InMemoryLocalStore();

    const client = new DocumentSyncClient(
      socket as any,
      session,
      "document-1",
      localStore,
    );

    const operation = createInsertBlockOperation(1, "client-a");

    session.applyOperation(operation);

    client.addPendingOperation(operation);

    const pendingOperations = await client.getPendingOperations();

    expect(pendingOperations).toHaveLength(1);

    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "document_operation_ack",
          operationId: operation.id,
        }),
      ),
    );

    const pendingOperation = await client.getPendingOperations();

    expect(pendingOperation).toHaveLength(0);
  });

  it("sends a document operation through the WebSocket", async() => {
    const socket = createMockSocket();
    const session = new DocumentSession("client-a");
    const localStore = new InMemoryLocalStore();

    const client = new DocumentSyncClient(
      socket as any,
      session,
      "document-1",
      localStore,
    );

    const operation = createInsertBlockOperation(1, "client-a");

    await client.applyLocalOperation(operation);

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "document_operation",
        operation,
      }),
    );
  });

  it("requests document sync from a given version", () => {
    const socket = createMockSocket();
    const session = new DocumentSession("client-a");
    const localStore = new InMemoryLocalStore();

    const client = new DocumentSyncClient(
      socket as any,
      session,
      "document-1",
      localStore,
    );

    client.requestSync(5);

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "document_sync_request",
        afterVersion: 5,
      }),
    );
  });

  it("applies operations received in document sync", () => {
    const socket = createMockSocket();
    const session = new DocumentSession("client-a");
    const localStore = new InMemoryLocalStore();

    const client = new DocumentSyncClient(
      socket as any,
      session,
      "document-1",
      localStore,
    );

    const operation1 = createInsertBlockOperation(1, "client-b");
    const operation2 = createInsertBlockOperation(2, "client-b");

    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "document_sync",
          operations: [
            {
              version: 1,
              operation: operation1,
            },
            {
              version: 2,
              operation: operation2,
            },
          ],
        }),
      ),
    );

    const snapshot = session.serialize();

    expect(snapshot.blockList.elements).toHaveLength(2);

    expect(JSON.parse(snapshot.blockList.elements[0].value)).toEqual(operation1.block);
    expect(JSON.parse(snapshot.blockList.elements[1].value)).toEqual(operation2.block);
  });

  it("applies, persists, and sends a local operation", async () => {
  const socket = createMockSocket();
  const session = new DocumentSession("client-a");
  const localStore = new InMemoryLocalStore();

  const client = new DocumentSyncClient(
    socket as any,
    session,
    "document-1",
    localStore,
  );

  const operation = createInsertBlockOperation(1, "client-a");

  await client.applyLocalOperation(operation);

  // The document was updated immediately.
  expect(
    session.serialize().blockList.elements,
  ).toHaveLength(1);

  expect(
    JSON.parse(session.serialize().blockList.elements[0].value),
  ).toEqual(operation.block);

  // The operation is persisted as pending.
  expect(
    await localStore.getPendingOperations("document-1"),
  ).toEqual([operation]);

  // The operation was sent to the server.
  expect(socket.send).toHaveBeenCalledWith(
    JSON.stringify({
      type: "document_operation",
      operation,
    }),
  );
});

it("keeps the local change after ACK and removes only the pending operation", async () => {
  const socket = createMockSocket();
  const session = new DocumentSession("client-a");
  const localStore = new InMemoryLocalStore();

  const client = new DocumentSyncClient(
    socket as any,
    session,
    "document-1",
    localStore,
  );

  const operation = createInsertBlockOperation(1, "client-a");

  await client.applyLocalOperation(operation);

  expect(
    await localStore.getPendingOperations("document-1"),
  ).toHaveLength(1);

  socket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "document_operation_ack",
        operationId: operation.id,
      }),
    ),
  );

  // Wait for the async message handler.
  await new Promise((resolve) => setTimeout(resolve, 0));

  // ACK removes the pending operation.
  expect(
    await localStore.getPendingOperations("document-1"),
  ).toHaveLength(0);

  // But the actual document change remains.
  expect(
    session.serialize().blockList.elements,
  ).toHaveLength(1);

  expect(
    JSON.parse(session.serialize().blockList.elements[0].value),
  ).toEqual(operation.block);
});

});