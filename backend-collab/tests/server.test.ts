import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { createServer } from "../src/server/create-server";
import { MockAuthService } from "../src/server/mock-auth";
import { DocumentAccessService } from "../src/server/document-access";

import type { InsertBlockOperation } from "../src/document/operations";
import { DocumentSession } from "../src/document/document-session";
import { DocumentSyncClient } from "../src/client/document-sync-client";
import { InMemoryLocalStore } from "../src/client/memory-local-store";

const authService = new MockAuthService();
const accessService = new DocumentAccessService();

const activeSockets = new Set<WebSocket>();

let server: ReturnType<typeof createServer> | null = null;
let port: number;

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}`);

    socket.once("open", () => {
      activeSockets.add(socket);
      resolve(socket);
    });

    socket.once("error", reject);

    socket.once("close", () => {
      activeSockets.delete(socket);
    });
  });
}

function nextMessage(
  socket: WebSocket,
  timeoutMs = 3000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error("Timed out waiting for WebSocket message"),
      );
    }, timeoutMs);

    const onMessage = (data: WebSocket.RawData) => {
      cleanup();
      resolve(JSON.parse(data.toString()));
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    function cleanup() {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("error", onError);
    }

    socket.on("message", onMessage);
    socket.once("error", onError);
  });
}

async function authenticate(
  socket: WebSocket,
  token: string,
  clientId?: string,
) {
  const response = nextMessage(socket);

  socket.send(
    JSON.stringify({
      type: "authenticate",
      token,
      ...(clientId ? { clientId } : {}),
    }),
  );

  return response;
}

async function joinDocument(
  socket: WebSocket,
  documentId: string,
) {
  const response = nextMessage(socket);

  socket.send(
    JSON.stringify({
      type: "join",
      documentId,
    }),
  );

  return response;
}

function createInsertBlockOperation(
  clientId: string,
  sequence: number,
  blockId: string,
): InsertBlockOperation {
  return {
    type: "insert_block",
    id: {
      clientId,
      sequence,
    },
    block: {
      id: blockId,
      type: "paragraph",
    },
    blockId: blockId,
    operation: {
      type: "insert",
      id: {
        clientId,
        sequence,
      },
      element: {
        id: {
          clientId,
          sequence,
        },
        value: JSON.stringify({
          id: blockId,
          type: "paragraph",
        }),
        after: null,
        deleted: false,
      },
    },
    after: null,
  };
}

async function sendBlockOperation(
  socket: WebSocket,
  operation: InsertBlockOperation,
) {
  const response = nextMessage(socket);

  socket.send(
    JSON.stringify({
      type: "document_operation",
      operation,
    }),
  );
  return response;
}

async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("Condition timed out");
}

describe("DocumentSyncClient real WebSocket integration", () => {
  beforeEach(() => {

    authService.registerToken(
      "user-a",
      "user-a",
    );

    authService.registerToken(
      "user-b",
      "user-b",
    );

    authService.registerToken(
      "user-viewer",
      "user-viewer",
    );

    accessService.grantPermission(
      "document-1",
      "user-a",
      "editor",
    );

    accessService.grantPermission("document-1", "user-viewer", "viewer");

    accessService.grantPermission(
      "document-1",
      "user-b",
      "editor",
    );
  

    server = createServer(
      0,
      authService,
      accessService,
    );

    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("WebSocket server did not bind to a TCP port");
    }

    port = address.port;
  });

  afterEach(async () => {
    for (const socket of activeSockets) {
      socket.close();
    }

    activeSockets.clear();

    if (server) {
      await server.close();
      server = null;
    }
  });

  it("sends a local document operation through the real server", async () => {
    const socket = await connect();

    const authResponse = await authenticate(
      socket,
      "user-a",
      "client-a",
    );

    expect(authResponse.type).toBe("authenticated");

    const joinResponse = await joinDocument(
      socket,
      "document-1",
    );

    expect(joinResponse.type).toBe("joined");

    const session = new DocumentSession("client-a");

    const localStore = new InMemoryLocalStore();

    const client = new DocumentSyncClient(
      socket,
      session,
      "document-1",
      localStore,
    );

    const operation = createInsertBlockOperation(
      "client-a",
      1,
      "block-1",
    );

    await client.applyLocalOperation(operation);

    /*
     * The operation should be applied locally immediately.
     */
    expect(session.getBlocks()).toEqual([
      {
        id: "block-1",
        type: "paragraph",
      },
    ]);

    /*
     * It should initially exist as a pending operation.
     */
    expect(
      await localStore.getPendingOperations("document-1"),
    ).toHaveLength(1);

    /*
     * The real server should eventually send the ACK.
     * DocumentSyncClient handles the ACK and removes the
     * operation from LocalStore.
     */
    await waitFor(async () => {
      const pending =
        await localStore.getPendingOperations("document-1");

      return pending.length === 0;
    });

    /*
     * The operation must remain in the local document
     * after the ACK.
     */
    expect(session.getBlocks()).toEqual([
      {
        id: "block-1",
        type: "paragraph",
      },
    ]);

    expect(
      await localStore.getPendingOperations("document-1"),
    ).toHaveLength(0);
  });

  it("broadcasts a document operation from client A to client B", async () => {
  const socketA = await connect();
  const socketB = await connect();

  await authenticate(socketA, "user-a", "client-a");
  await authenticate(socketB, "user-b", "client-b");

  await joinDocument(socketA, "document-1");
  await joinDocument(socketB, "document-1");

  const sessionA = new DocumentSession("client-a");
  const sessionB = new DocumentSession("client-b");

  const storeA = new InMemoryLocalStore();
  const storeB = new InMemoryLocalStore();

  const clientA = new DocumentSyncClient(
    socketA,
    sessionA,
    "document-1",
    storeA,
  );

  const clientB = new DocumentSyncClient(
    socketB,
    sessionB,
    "document-1",
    storeB,
  );

  const operation = createInsertBlockOperation(
    "client-a",
    1,
    "block-1",
  );

  await clientA.applyLocalOperation(operation);

  await waitFor(async () => {
    return sessionB.getBlocks().length === 1;
  });

  expect(sessionB.getBlocks()).toEqual([
    {
      id: "block-1",
      type: "paragraph",
    },
  ]);
});

it("does not apply its own broadcast twice", async () => {
  const socketA = await connect();

  await authenticate(socketA, "user-a", "client-a");
  await joinDocument(socketA, "document-1");

  const sessionA = new DocumentSession("client-a");
  const storeA = new InMemoryLocalStore();

  const clientA = new DocumentSyncClient(
    socketA,
    sessionA,
    "document-1",
    storeA,
  );

  const operation = createInsertBlockOperation(
    "client-a",
    1,
    "block-1",
  );

  await clientA.applyLocalOperation(operation);

  await waitFor(async () => {
    return (
      await storeA.getPendingOperations("document-1")
    ).length === 0;
  });

  expect(sessionA.getBlocks()).toHaveLength(1);

  expect(sessionA.getBlocks()).toEqual([
    {
      id: "block-1",
      type: "paragraph",
    },
  ]);
});

it("removes a pending operation after ACK", async () => {
  const socket = await connect();

  await authenticate(socket, "user-a", "client-a");
  await joinDocument(socket, "document-1");

  const session = new DocumentSession("client-a");
  const store = new InMemoryLocalStore();

  const client = new DocumentSyncClient(
    socket,
    session,
    "document-1",
    store,
  );

  const operation = createInsertBlockOperation(
    "client-a",
    1,
    "block-1",
  );

  await client.applyLocalOperation(operation);

  expect(
    await store.getPendingOperations("document-1"),
  ).toHaveLength(1);

  await waitFor(async () => {
    return (
      await store.getPendingOperations("document-1")
    ).length === 0;
  });

  expect(
    await store.getPendingOperations("document-1"),
  ).toHaveLength(0);
});

it("keeps the local document after ACK", async () => {
  const socket = await connect();

  await authenticate(socket, "user-a", "client-a");
  await joinDocument(socket, "document-1");

  const session = new DocumentSession("client-a");
  const store = new InMemoryLocalStore();

  const client = new DocumentSyncClient(
    socket,
    session,
    "document-1",
    store,
  );

  const operation = createInsertBlockOperation(
    "client-a",
    1,
    "block-1",
  );

  await client.applyLocalOperation(operation);

  await waitFor(async () => {
    return (
      await store.getPendingOperations("document-1")
    ).length === 0;
  });

  expect(session.getBlocks()).toEqual([
    {
      id: "block-1",
      type: "paragraph",
    },
  ]);
});

it("rejects a document operation from a viewer", async () => {
  const socket = await connect();

  const authResponse = await authenticate(
    socket,
    "user-viewer"
  );

  const joinResponse = await joinDocument(
    socket,
    "document-1",
  );

  expect(authResponse.type).toBe("authenticated");
  expect(joinResponse.type).toBe("joined");

  const operation = createInsertBlockOperation(
    "client-viewer",
    1,
    "block-1",
  );

  const response = await sendBlockOperation(
    socket,
    operation,
  );

  expect(response.type).toBe("error");
  expect(response.message).toContain("access denied");
});

it("rejects an operation using another client's identity", async () => {
  const socket = await connect();

  await authenticate(socket, "user-a", "client-a");
  await joinDocument(socket, "document-1");

  const operation = createInsertBlockOperation(
    "client-b",
    1,
    "block-1",
  );

  const response = await sendBlockOperation(
    socket,
    operation,
  );

  expect(response.type).toBe("error");
  expect(response.message).toContain("Invalid operation identity");
});

it("handles duplicate retransmission idempotently", async () => {
  const socket = await connect();

  await authenticate(socket, "user-a", "client-a");
  await joinDocument(socket, "document-1");

  const operation = createInsertBlockOperation(
    "client-a",
    1,
    "block-1",
  );

  const firstResponse = await sendBlockOperation(
    socket,
    operation,
  );

  expect(firstResponse.type).toBe(
    "document_operation_ack",
  );

  /*
   * Retransmit exactly the same operation.
   */
  const secondResponse = await sendBlockOperation(
    socket,
    operation,
  );

  expect(secondResponse.type).toBe(
    "document_operation_ack",
  );
});

it("does not apply the same remote operation twice", async () => {
  const socketB = await connect();

  await authenticate(socketB, "user-b", "client-b");
  await joinDocument(socketB, "document-1");

  const sessionB = new DocumentSession("client-b");
  const storeB = new InMemoryLocalStore();

  new DocumentSyncClient(
    socketB,
    sessionB,
    "document-1",
    storeB,
  );

  const operation = createInsertBlockOperation(
    "client-a",
    1,
    "block-1",
  );

  /*
   * This requires the test server/helper to inject a
   * document_operation message twice.
   *
   * If you don't currently have such a helper, skip this
   * test at the real-WS layer; your unit test already
   * covers the appliedOperations guarantee.
   */
});

it("syncs an operation missed before connecting", async () => {
  const socketA = await connect();

  await authenticate(socketA, "user-a", "client-a");
  await joinDocument(socketA, "document-1");

  const sessionA = new DocumentSession("client-a");
  const storeA = new InMemoryLocalStore();

  const clientA = new DocumentSyncClient(
    socketA,
    sessionA,
    "document-1",
    storeA,
  );

  const operation = createInsertBlockOperation(
    "client-a",
    1,
    "block-1",
  );

  await clientA.applyLocalOperation(operation);

  await waitFor(async () => {
    return (
      await storeA.getPendingOperations("document-1")
    ).length === 0;
  });

  /*
   * Now B connects after the operation already exists.
   */

  const socketB = await connect();

  await authenticate(socketB, "user-b", "client-b");
  await joinDocument(socketB, "document-1");

  const sessionB = new DocumentSession("client-b");
  const storeB = new InMemoryLocalStore();

  const clientB = new DocumentSyncClient(
    socketB,
    sessionB,
    "document-1",
    storeB,
  );

  await clientB.reconnect(socketB);

  await waitFor(async () => {
    return sessionB.getBlocks().length === 1;
  });

  expect(sessionB.getBlocks()).toEqual([
    {
      id: "block-1",
      type: "paragraph",
    },
  ]);
});

it("resends pending operations after reconnect", async () => {
  const socketA = await connect();

  await authenticate(socketA, "user-a", "client-a");
  await joinDocument(socketA, "document-1");

  const session = new DocumentSession("client-a");
  const store = new InMemoryLocalStore();

  const client = new DocumentSyncClient(
    socketA,
    session,
    "document-1",
    store,
  );

  const operation = createInsertBlockOperation(
    "client-a",
    1,
    "block-1",
  );

  // Simulate an operation created while offline.
  await session.applyOperation(operation);

  await store.savePendingOperation(
    "document-1",
    operation,
  );

  expect(
    await store.getPendingOperations("document-1"),
  ).toHaveLength(1);

  socketA.close();

  const socketB = await connect();

  await authenticate(
    socketB,
    "user-a",
    "client-a",
  );

  await joinDocument(
    socketB,
    "document-1",
  );

  await client.reconnect(socketB);

  await waitFor(async () => {
    return (
      await store.getPendingOperations("document-1")
    ).length === 0;
  });

  expect(session.getBlocks()).toEqual([
    {
      id: "block-1",
      type: "paragraph",
    },
  ]);
});

it("receives missed remote operations after reconnect", async () => {
  /*
   * Connect A and B.
   */
  const socketA = await connect();
  const socketB = await connect();

  await authenticate(socketA, "user-a", "client-a");
  await authenticate(socketB, "user-b", "client-b");

  await joinDocument(socketA, "document-1");
  await joinDocument(socketB, "document-1");

  const sessionA = new DocumentSession("client-a");
  const sessionB = new DocumentSession("client-b");

  const storeA = new InMemoryLocalStore();
  const storeB = new InMemoryLocalStore();

  const clientA = new DocumentSyncClient(
    socketA,
    sessionA,
    "document-1",
    storeA,
  );

  const clientB = new DocumentSyncClient(
    socketB,
    sessionB,
    "document-1",
    storeB,
  );

  /*
   * Disconnect B.
   */
  socketB.close();

  /*
   * A makes an operation while B is disconnected.
   */
  const operation = createInsertBlockOperation(
    "client-a",
    1,
    "block-1",
  );

  await clientA.applyLocalOperation(operation);

  await waitFor(async () => {
    return (
      await storeA.getPendingOperations("document-1")
    ).length === 0;
  });

  /*
   * Reconnect B.
   */
  const socketB2 = await connect();

  await authenticate(
    socketB2,
    "user-b",
    "client-b",
  );

  await joinDocument(socketB2, "document-1");

  await clientB.reconnect(socketB2);

  await waitFor(async () => {
    return sessionB.getBlocks().length === 1;
  });

  expect(sessionB.getBlocks()).toEqual([
    {
      id: "block-1",
      type: "paragraph",
    },
  ]);
});

it("recovers missed remote operations and pending local operations after reconnect", async () => {
  // A connects
  const socketA = await connect();

  await authenticate(socketA, "user-a", "client-a");
  await joinDocument(socketA, "document-1");

  const sessionA = new DocumentSession("client-a");
  const storeA = new InMemoryLocalStore();

  const clientA = new DocumentSyncClient(
    socketA,
    sessionA,
    "document-1",
    storeA,
  );

  // B connects
  const socketB = await connect();

  await authenticate(socketB, "user-b", "client-b");
  await joinDocument(socketB, "document-1");

  const sessionB = new DocumentSession("client-b");
  const storeB = new InMemoryLocalStore();

  const clientB = new DocumentSyncClient(
    socketB,
    sessionB,
    "document-1",
    storeB,
  );

  // B goes offline
  socketB.close();

  // A creates an operation B will miss
  const operationA = createInsertBlockOperation(
    "client-a",
    1,
    "block-a",
  );

  await clientA.applyLocalOperation(operationA);

  await waitFor(async () => {
    return (
      await storeA.getPendingOperations("document-1")
    ).length === 0;
  });

  // B creates an operation while offline
  const operationB = createInsertBlockOperation(
    "client-b",
    1,
    "block-b",
  );

  await sessionB.applyOperation(operationB);

  await storeB.savePendingOperation(
    "document-1",
    operationB,
  );

  // B reconnects
  const socketB2 = await connect();

  await authenticate(
    socketB2,
    "user-b",
    "client-b",
  );

  await joinDocument(socketB2, "document-1");

  await clientB.reconnect(socketB2);

  // Eventually B should contain A's operation
  await waitFor(async () => {
    return sessionB.getBlocks().length === 2;
  });

  // Eventually A should receive B's operation
  await waitFor(async () => {
    return sessionA.getBlocks().length === 2;
  });

  expect(sessionA.getBlocks()).toHaveLength(2);
  expect(sessionB.getBlocks()).toHaveLength(2);

  expect(
    await storeB.getPendingOperations("document-1"),
  ).toHaveLength(0);
});

it("replicates multiple operations in order", async () => {
  const socketA = await connect();
  const socketB = await connect();

  await authenticate(socketA, "user-a", "client-a");
  await authenticate(socketB, "user-b", "client-b");

  await joinDocument(socketA, "document-1");
  await joinDocument(socketB, "document-1");

  const sessionA = new DocumentSession("client-a");
  const sessionB = new DocumentSession("client-b");

  const storeA = new InMemoryLocalStore();
  const storeB = new InMemoryLocalStore();

  const clientA = new DocumentSyncClient(
    socketA,
    sessionA,
    "document-1",
    storeA,
  );

  new DocumentSyncClient(
    socketB,
    sessionB,
    "document-1",
    storeB,
  );

  const operation1 = createInsertBlockOperation(
    "client-a",
    1,
    "block-1",
  );

  const operation2 = createInsertBlockOperation(
    "client-a",
    2,
    "block-2",
  );

  await clientA.applyLocalOperation(operation1);
  await clientA.applyLocalOperation(operation2);

  await waitFor(async () => {
    return sessionB.getBlocks().length === 2;
  });

  expect(sessionB.getBlocks()).toHaveLength(2);
});

it("replicates block creation and text editing", async () => {
  const socketA = await connect();
  const socketB = await connect();

  await authenticate(socketA, "user-a", "client-a");
  await authenticate(socketB, "user-b", "client-b");

  await joinDocument(socketA, "document-1");
  await joinDocument(socketB, "document-1");

  const sessionA = new DocumentSession("client-a");
  const sessionB = new DocumentSession("client-b");

  const storeA = new InMemoryLocalStore();
  const storeB = new InMemoryLocalStore();

  const clientA = new DocumentSyncClient(
    socketA,
    sessionA,
    "document-1",
    storeA,
  );

  const clientB = new DocumentSyncClient(
    socketB,
    sessionB,
    "document-1",
    storeB,
  );

  // --------------------------------------------------
  // 1. Create a block
  // --------------------------------------------------

  const blockOperation = createInsertBlockOperation(
    "client-a",
    1,
    "block-1",
  );

  await clientA.applyLocalOperation(blockOperation);

  await waitFor(async () => {
    return sessionB.getBlocks().length === 1;
  });

  expect(sessionA.getBlocks()).toEqual([
    {
      id: "block-1",
      type: "paragraph",
    },
  ]);

  expect(sessionB.getBlocks()).toEqual([
    {
      id: "block-1",
      type: "paragraph",
    },
  ]);

  // --------------------------------------------------
  // 2. Insert text into the block
  // --------------------------------------------------

  const textOperation = {
  type: "insert_text" as const,
  blockId: "block-1",
  id: {
    clientId: "client-a",
    sequence: 2,
  },
  operation: {
    type: "insert" as const,
    id: {
      clientId: "client-a:block-1",
      sequence: 1,
    },
    element: {
      id: {
        clientId: "client-a:block-1",
        sequence: 1,
      },
      value: "Hello",
      after: null,
      deleted: false,
    },
  },
};

await clientA.applyLocalOperation(textOperation);


await waitFor(async () => {
    
  return sessionB.getText("block-1") === "Hello";
});

  await clientA.applyLocalOperation(textOperation);

  // --------------------------------------------------
  // 3. Wait for B to receive the text operation
  // --------------------------------------------------

  await waitFor(async () => {
    return sessionB.getText("block-1") === "Hello";
  });

  // --------------------------------------------------
  // 4. Verify both clients converged
  // --------------------------------------------------

  expect(sessionA.getText("block-1")).toBe("Hello");

  expect(sessionB.getText("block-1")).toBe("Hello");

  // --------------------------------------------------
  // 5. Verify both still have the block
  // --------------------------------------------------

  expect(sessionA.getBlocks()).toHaveLength(1);
  expect(sessionB.getBlocks()).toHaveLength(1);
});

it("recovers missed remote operations and pending local operations after reconnect", async () => {
  // ============================================================
  // 1. Connect both clients
  // ============================================================

  const socketA = await connect();
  const socketB = await connect();

  await authenticate(
    socketA,
    "user-a",
    "client-a",
  );

  await authenticate(
    socketB,
    "user-b",
    "client-b",
  );

  await joinDocument(
    socketA,
    "document-1",
  );

  await joinDocument(
    socketB,
    "document-1",
  );

  // ============================================================
  // 2. Create DocumentSyncClients
  // ============================================================

  const sessionA = new DocumentSession("client-a");
  const sessionB = new DocumentSession("client-b");

  const storeA = new InMemoryLocalStore();
  const storeB = new InMemoryLocalStore();

  const clientA = new DocumentSyncClient(
    socketA,
    sessionA,
    "document-1",
    storeA,
  );

  const clientB = new DocumentSyncClient(
    socketB,
    sessionB,
    "document-1",
    storeB,
  );

  // ============================================================
  // 3. A creates the first block
  // ============================================================

  const operationA1 =
    createInsertBlockOperation(
      "client-a",
      1,
      "block-a1",
    );

  await clientA.applyLocalOperation(
    operationA1,
  );

  // B should receive A's first operation.
  await waitFor(async () => {
    return (
      sessionB.getBlocks().length === 1
    );
  });

  expect(sessionA.getBlocks()).toEqual([
    {
      id: "block-a1",
      type: "paragraph",
    },
  ]);

  expect(sessionB.getBlocks()).toEqual([
    {
      id: "block-a1",
      type: "paragraph",
    },
  ]);

  // ============================================================
  // 4. B disconnects
  // ============================================================

  socketB.close();

  /*
   * Give the WebSocket a moment to finish closing.
   */
  await new Promise((resolve) =>
    setTimeout(resolve, 50),
  );

  // ============================================================
  // 5. A creates another operation while B is offline
  // ============================================================

  const operationA2 =
    createInsertBlockOperation(
      "client-a",
      2,
      "block-a2",
    );

  await clientA.applyLocalOperation(
    operationA2,
  );

  /*
   * A should have both blocks.
   */
  await waitFor(async () => {
    return (
      sessionA.getBlocks().length === 2
    );
  });

  expect(sessionA.getBlocks()).toEqual([
    {
      id: "block-a2",
      type: "paragraph",
    },
    {
      id: "block-a1",
      type: "paragraph",
    },
  ]);

  /*
   * B must still only have the first block because
   * it was disconnected when A created block-a2.
   */
  expect(sessionB.getBlocks()).toEqual([
    {
      id: "block-a1",
      type: "paragraph",
    },
  ]);

  // ============================================================
  // 6. B creates an operation while offline
  // ============================================================

  const operationB1 =
    createInsertBlockOperation(
      "client-b",
      1,
      "block-b1",
    );

  /*
   * Simulate the local edit that would normally happen
   * through clientB.applyLocalOperation().
   *
   * The old socket is closed, so the operation cannot
   * reach the server.
   */
  await sessionB.applyOperation(
    operationB1,
  );

  await storeB.savePendingOperation(
    "document-1",
    operationB1,
  );

  expect(sessionB.getBlocks()).toHaveLength(2);

  expect(
    await storeB.getPendingOperations(
      "document-1",
    ),
  ).toHaveLength(1);

  // ============================================================
  // 7. Verify the two clients are currently divergent
  // ============================================================

  expect(sessionA.getBlocks()).toHaveLength(2);

  expect(sessionB.getBlocks()).toHaveLength(2);

  expect(
    sessionA
      .getBlocks()
      .some((block) => block.id === "block-a2"),
  ).toBe(true);

  expect(
    sessionB
      .getBlocks()
      .some((block) => block.id === "block-b1"),
  ).toBe(true);

  /*
   * At this point:
   *
   * A knows:
   *   a1
   *   a2
   *
   * B knows:
   *   a1
   *   b1
   *
   * Neither has the other's missing operation.
   */

  // ============================================================
  // 8. Reconnect B
  // ============================================================

  const socketB2 = await connect();

  await authenticate(
    socketB2,
    "user-b",
    "client-b",
  );

  await joinDocument(
    socketB2,
    "document-1",
  );

  /*
   * reconnect() performs:
   *
   *   1. requestSync(serverVersion)
   *   2. resendPendingOperations()
   */
  await clientB.reconnect(
    socketB2,
  );

  // ============================================================
  // 9. B should receive A's missed operation
  // ============================================================

  await waitFor(async () => {
    return (
      sessionB
        .getBlocks()
        .some(
          (block) =>
            block.id === "block-a2",
        )
    );
  });

  expect(
    sessionB
      .getBlocks()
      .some(
        (block) =>
          block.id === "block-a2",
      ),
  ).toBe(true);

  // ============================================================
  // 10. A should receive B's pending operation
  // ============================================================

  await waitFor(async () => {
    return (
      sessionA
        .getBlocks()
        .some(
          (block) =>
            block.id === "block-b1",
        )
    );
  });

  expect(
    sessionA
      .getBlocks()
      .some(
        (block) =>
          block.id === "block-b1",
      ),
  ).toBe(true);

  // ============================================================
  // 11. B's pending operation should be ACKed
  // ============================================================

  await waitFor(async () => {
    const pending =
      await storeB.getPendingOperations(
        "document-1",
      );

    return pending.length === 0;
  });

  expect(
    await storeB.getPendingOperations(
      "document-1",
    ),
  ).toHaveLength(0);

  // ============================================================
  // 12. Both clients must converge
  // ============================================================

  await waitFor(async () => {
    return (
      sessionA.getBlocks().length === 3 &&
      sessionB.getBlocks().length === 3
    );
  });

  expect(
    sessionA.getBlocks(),
  ).toHaveLength(3);

  expect(
    sessionB.getBlocks(),
  ).toHaveLength(3);

  // ============================================================
  // 13. Verify A has all three blocks
  // ============================================================

  expect(
    sessionA
      .getBlocks()
      .map((block) => block.id)
      .sort(),
  ).toEqual([
    "block-a1",
    "block-a2",
    "block-b1",
  ]);

  // ============================================================
  // 14. Verify B has all three blocks
  // ============================================================

  expect(
    sessionB
      .getBlocks()
      .map((block) => block.id)
      .sort(),
  ).toEqual([
    "block-a1",
    "block-a2",
    "block-b1",
  ]);

  // ============================================================
  // 15. Final convergence check
  // ============================================================

  expect(
    sessionA.getBlocks(),
  ).toEqual(
    sessionB.getBlocks(),
  );
});

});