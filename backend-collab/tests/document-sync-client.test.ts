import { describe, expect, it, vi } from "vitest";
import { DocumentSyncClient } from "../src/client/document-sync-client";
import { DocumentSession } from "../src/document/document-session";
import type { InsertBlockOperation } from "../src/document/operations";
import { InMemoryLocalStore } from "../src/client/memory-local-store";

function createMockSocket(readyState = 1) {
  const listeners = new Map<string, ((...args: any[]) => void)[]>();

  return {
    readyState,
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
    operation: {
      type: "insert",
      id: {
        clientId,
        sequence
      },
      element: {
        id: {
          clientId,
          sequence
        },
        value: JSON.stringify({
          id: `block-${sequence}`,
          type: "paragraph",
        }),
        after: null,
        deleted: false,
      }
    },
    block: {
      id: `block-${sequence}`,
      type: "paragraph",
    },
    blockId: `block-${sequence}`,
    after: null,
  };
}

describe("DocumentSyncClient", async () => {
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

  it("removes an acknowledged operation from pending", async () => {
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

  it("sends a document operation through the WebSocket", async () => {
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

  it("resends pending operations after reconnect", async () => {
    const oldSocket = createMockSocket();
    const newSocket = createMockSocket();

    const session = new DocumentSession("client-a");
    const localStore = new InMemoryLocalStore();

    const client = new DocumentSyncClient(
      oldSocket as any,
      session,
      "document-1",
      localStore,
    );

    const operation1 = createInsertBlockOperation(1, "client-a");
    const operation2 = createInsertBlockOperation(2, "client-a");

    await localStore.savePendingOperation(
      "document-1",
      operation1,
    );

    await localStore.savePendingOperation(
      "document-1",
      operation2,
    );

    await client.reconnect(newSocket as any);

    expect(newSocket.send).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({
        type: "document_sync_request",
        afterVersion: 0,
      }),
    );

    expect(newSocket.send).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({
        type: "document_operation",
        operation: operation1,
      }),
    );

    expect(newSocket.send).toHaveBeenNthCalledWith(
      3,
      JSON.stringify({
        type: "document_operation",
        operation: operation2,
      }),
    );
  });

  it("does not resend pending operations while the socket is not open", async () => {
    const socket = createMockSocket(0);

    const session = new DocumentSession("client-a");
    const localStore = new InMemoryLocalStore();

    const client = new DocumentSyncClient(
      socket as any,
      session,
      "document-1",
      localStore,
    );

    const operation = createInsertBlockOperation(1, "client-a");

    await localStore.savePendingOperation(
      "document-1",
      operation,
    );

    await client.resendPendingOperations();

    expect(socket.send).not.toHaveBeenCalled();
  });

  it("applies synced operations and updates server version", async () => {
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
              version: 5,
              operation: operation1,
            },
            {
              version: 6,
              operation: operation2,
            },
          ],
        }),
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(session.getBlocks()).toEqual([
      operation2.block,
      operation1.block,
    ]);

    expect(client.getServerVersion()).toBe(6);
  });

  it("does not apply its own document operation twice", async () => {
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

    // Local edit.
    await client.applyLocalOperation(operation);

    expect(session.getBlocks()).toEqual([
      operation.block,
    ]);

    // Server broadcasts the same operation back to us.
    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "document_operation",
          operation,
        }),
      ),
    );

    // Give the async message handler time to finish.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // It must still exist only once.
    expect(session.getBlocks()).toEqual([
      operation.block,
    ]);
  });

  it("applies a document operation from another client", async () => {
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

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(session.getBlocks()).toEqual([
      operation.block,
    ]);
  });

  it("does not remove its pending operation when receiving its own broadcast", async () => {
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

    // Server broadcasts our operation back.
    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "document_operation",
          operation,
        }),
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Still pending — we haven't received the ACK yet.
    expect(
      await localStore.getPendingOperations("document-1"),
    ).toHaveLength(1);
  });

  it("does not apply a pending local operation again during document sync", async () => {
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

    // Local operation is already applied.
    await client.applyLocalOperation(operation);

    expect(session.getBlocks()).toEqual([
      operation.block,
    ]);

    // The server later sends the same operation through sync.
    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "document_sync",
          operations: [
            {
              version: 5,
              operation,
            },
          ],
        }),
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Must still exist only once.
    expect(session.getBlocks()).toEqual([
      operation.block,
    ]);

    expect(client.getServerVersion()).toBe(5);
  });

  it("does not apply the same synced operation twice", async () => {
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

    const message = {
      type: "document_sync",
      operations: [
        {
          version: 5,
          operation,
        },
      ],
    };

    socket.emit(
      "message",
      Buffer.from(JSON.stringify(message)),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    socket.emit(
      "message",
      Buffer.from(JSON.stringify(message)),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(session.getBlocks()).toEqual([
      operation.block,
    ]);

    expect(client.getServerVersion()).toBe(5);
  });

  it("applies different synced operations", async () => {
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
              version: 5,
              operation: operation1,
            },
            {
              version: 6,
              operation: operation2,
            },
          ],
        }),
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(session.getBlocks()).toEqual([
      operation2.block,
      operation1.block,
    ]);

    expect(client.getServerVersion()).toBe(6);
  });
});