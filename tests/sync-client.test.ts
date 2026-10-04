import { describe, expect, it } from "vitest";
import { SyncClient } from "../src/client/sync-client";
import { SyncState } from "../src/client/sync-state";
import { InMemoryLocalStore } from "../src/client/memory-local-store";
import { IndexedDBLocalStore } from "../src/client/indexed-db-local-store";
import "fake-indexeddb/auto";
import { DocumentSession } from "../src/document/document-session";
import { DocumentSyncClient } from "../src/client/document-sync-client";
import type { InsertBlockOperation } from "../src/document/operations";

function createFakeSocket() {
  return {
    sent: [] as string[],

    send(message: string) {
      this.sent.push(message);
    },

    readyState: 1,
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

describe("SyncClient", () => {
  it("requests sync using its current version vector", () => {
    const socket = createFakeSocket();
    const state = new SyncState("client-a");
    const localStore = new InMemoryLocalStore();
    const client = new SyncClient(socket as any, state, localStore, "doc-1");

    state.insert("H", null);

    client.requestSync();

    const syncMessage = JSON.parse(socket.sent[0]!)

    console.log("parsedSyncMessage", syncMessage)

    expect(syncMessage).toEqual({
      type: "sync",
      versionVector: {},
    });
  })

  it("applies synchronized operations", () => {
    const socket = createFakeSocket();
    const state = new SyncState("client-b");
    const localStore = new InMemoryLocalStore();
    const client = new SyncClient(socket as any, state, localStore, "doc-1");

    client.handleMessage({
      type: "sync",
      operations: [
        {
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
        },
      ],
    });

    expect(client.getText()).toBe("H");

    expect(client.getVersionVector()).toEqual({
      "client-a": 1,
    });
  });

  it("sends locally created operations", () => {
    const socket = createFakeSocket();
    const state = new SyncState("client-a");
    const localStore = new InMemoryLocalStore();
    const client = new SyncClient(socket as any, state, localStore, "doc-1");

    const operation = client.insert("H", null);

    expect(JSON.parse(socket.sent[0]!)).toEqual({
      type: "operation",
      operation,
    });

    expect(client.getText()).toBe("H");
  });

  it("queues local operations while disconnected", async () => {
  const socket = createFakeSocket();

  socket.readyState = 0;

  const state = new SyncState("client-a");
  const localStore = new InMemoryLocalStore();
  const client = new SyncClient(socket as any, state, localStore, "doc-1");

  const operation = client.insert("H", null);

  expect(socket.sent).toHaveLength(0);
  expect(client.getText()).toBe("H");

  socket.readyState = 1;

  await client.reconnected();

  expect(socket.sent).toHaveLength(2);

  expect(JSON.parse(socket.sent[0]!)).toEqual({
    type: "sync",
    versionVector: {},
  });

  expect(JSON.parse(socket.sent[1]!)).toEqual({
    type: "operation",
    operation,
  });
});

it("resyncs after being offline while remote operations were created", async() => {
  const socket = createFakeSocket();
  const state = new SyncState("client-b");
  const localStore = new InMemoryLocalStore();
  const client = new SyncClient(socket as any, state, localStore, "doc-1");

  // Client B is initially connected and receives an operation
  // from Client A.
  client.handleMessage({
    type: "operation",
    operation: {
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
        value: "A",
        after: null,
        deleted: false,
      },
    },
  });

  expect(client.getText()).toBe("A");

  // Client B goes offline.
  socket.readyState = 0;

  const localOperation = client.insert(
    "B",
    {
      clientId: "client-a",
      sequence: 1,
    },
  );

  expect(client.getText()).toBe("AB");
  expect(socket.sent).toHaveLength(0);

  // Client B reconnects.
  socket.readyState = 1;
  await client.reconnected();

  expect(socket.sent).toHaveLength(2);

  const syncMessage = JSON.parse(socket.sent[0]!);

  expect(syncMessage).toEqual({
    type: "sync",
    versionVector: {
      "client-a":1,
    },
  });

  const operationMessage = JSON.parse(socket.sent[1]!);

  expect(operationMessage).toEqual({
    type: "operation",
    operation: localOperation,
  });
});

it("keeps an operation pending until the server acknowledges it", async() => {
  const socket = createFakeSocket();
  const state = new SyncState("client-a");
  const localStore = new InMemoryLocalStore();
  const client = new SyncClient(socket as any, state, localStore, "doc-1");

  const operation = client.insert("H", null);

  expect(socket.sent).toHaveLength(1);

  // Simulate reconnect/flush before acknowledgement.
  await client.reconnected();

  expect(socket.sent).toHaveLength(3);

  // First message = operation
  // Second message = sync
  // Third message = operation retry

  const retry = JSON.parse(socket.sent[2]!);

  expect(retry).toEqual({
    type: "operation",
    operation,
  });

  // Now server acknowledges it.
  client.handleMessage({
    type: "operation_ack",
    operationId: operation.id,
  });

  // Another reconnect should NOT resend the operation.
  await client.reconnected();

  console.log("socket.sent", socket.sent.length)

  expect(socket.sent).toHaveLength(4);

  const lastMessage = JSON.parse(socket.sent[3]!);

  expect(lastMessage).toEqual({
    type: "sync",
    versionVector: {
      "client-a": 1,
    },
  });
});

// it("restores pending operations from local storage", async () => {
//   const store = new InMemoryLocalStore();

//   const socket1 = createFakeSocket();
//   const state1 = new SyncState("client-1");

//   const client1 = new SyncClient(
//     socket1 as any,
//     state1,
//     store,
//     "doc-1"
//   );

//   client1.insert("H", null);

//   expect(client1.getPendingOperationCount()).toBe(1);

//   const socket2 = createFakeSocket();
//   const state2 = new SyncState("client-1");

//   const client2 = new SyncClient(
//     socket2 as any,
//     state2,
//     store,
//     "doc-1"
//   );

//   await client2.restorePendingOperations();

//   expect(client2.getPendingOperationCount()).toBe(1);
// });

// it("restores document state from local storage", async () => {
//   const store = new InMemoryLocalStore();

//   const socket1 = createFakeSocket();
//   const state1 = new SyncState("client-a");

//   const client1 = new SyncClient(
//     socket1 as any,
//     state1,
//     store,
//     "doc-1"
//   );

//   client1.insert("H", null);

//   await client1.saveDocumentState();

//   const socket2 = createFakeSocket();
//   const state2 = new SyncState("client-a");

//   const client2 = new SyncClient(
//     socket2 as any,
//     state2,
//     store,
//     "doc-1"
//   );

//   expect(client2.getText()).toBe("");

//   await client2.restoreDocumentState();

//   expect(client2.getText()).toBe("H");

//   expect(client2.getVersionVector()).toEqual({
//     "client-a": 1,
//   });
// });

// it("automatically persists local document changes", async () => {
//   const store = new InMemoryLocalStore();

//   const socket = createFakeSocket();
//   const state = new SyncState("client-a");

//   const client = new SyncClient(
//     socket as any,
//     state,
//     store,
//     "doc-1"
//   );

//   client.insert("H", null);

//   const savedDocument = await store.loadDocument("doc-1");

//   expect(savedDocument).not.toBeNull();
//   expect(savedDocument?.state.blockList.versionVector).toEqual({
//     "client-a": 1,
//   });
// });

// it("persists remotely received operations", async () => {
//   const store = new InMemoryLocalStore();

//   const socket = createFakeSocket();
//   const state = new SyncState("client-b");

//   const client = new SyncClient(
//     socket as any,
//     state,
//     store,
//     "doc-1"
//   );

//   await client.handleMessage({
//     type: "operation",
//     operation: {
//       type: "insert",
//       id: {
//         clientId: "client-a",
//         sequence: 1,
//       },
//       element: {
//         id: {
//           clientId: "client-a",
//           sequence: 1,
//         },
//         value: "H",
//         after: null,
//         deleted: false,
//       },
//     },
//   });

//   const document = await store.loadDocument("doc-1");

//   expect(document?.state.blockList.versionVector).toEqual({
//     "client-a": 1,
//   });

//   expect(document?.state.blockList.elements).toHaveLength(1);
// });

// it("persists state received through sync", async () => {
//   const store = new InMemoryLocalStore();

//   const socket = createFakeSocket();
//   const state = new SyncState("client-b");

//   const client = new SyncClient(
//     socket as any,
//     state,
//     store,
//     "doc-1"
//   );

//   await client.handleMessage({
//     type: "sync",
//     operations: [
//       {
//         type: "insert",
//         id: {
//           clientId: "client-a",
//           sequence: 1,
//         },
//         element: {
//           id: {
//             clientId: "client-a",
//             sequence: 1,
//           },
//           value: "H",
//           after: null,
//           deleted: false,
//         },
//       },
//     ],
//   });

//   const document = await store.loadDocument("doc-1");

//   expect(document?.state.blockList.versionVector).toEqual({
//     "client-a": 1,
//   });

//   expect(document?.state.blockList.elements).toHaveLength(1);
// });

// it("works with IndexedDBLocalStore", async () => {
//   const store = new IndexedDBLocalStore();

//   const socket = createFakeSocket();
//   const state = new SyncState("client-a");

//   const client = new SyncClient(
//     socket as any,
//     state,
//     store,
//     "doc-1"
//   );

//   client.insert("H", null);

//   const savedDocument =
//     await store.loadDocument("doc-1");

//   const pendingOperations =
//     await store.getPendingOperations("doc-1");

//     console.log("savedDocument", savedDocument)

//   expect(savedDocument?.state.blockList.elements).toHaveLength(1);

//   expect(
//     savedDocument?.state.blockList.versionVector
//   ).toEqual({
//     "client-a": 1,
//   });

//   expect(pendingOperations).toHaveLength(1);

//   store.close();
// });

// it("persists a pending operation before sending it", async () => {
//   const socket = createFakeSocket();
//   const session = new DocumentSession("client-a");
//   const localStore = new InMemoryLocalStore();

//   const client = new DocumentSyncClient(
//     socket as any,
//     session,
//     "document-1",
//     localStore,
//   );

//   const operation = createInsertBlockOperation(1, "client-a");

//   await client.sendOperation(operation);

//   expect(
//     await localStore.getPendingOperations("document-1"),
//   ).toEqual([operation]);

//   expect(socket.send).toHaveBeenCalledWith(
//     JSON.stringify({
//       type: "document_operation",
//       operation,
//     }),
//   );
// });

});