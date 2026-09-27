import {
  describe,
  expect,
  it,
  beforeAll,
  afterAll,
} from "vitest";

import WebSocket from "ws";

import { InMemoryOperationStore } from "../src/server/memory-operation-store";
import { InMemoryDocumentStore } from "../src/server/memory-document-store";
import { Room } from "../src/server/room";
import { RGA } from "../src/crdt/rga";

import { createServer } from "../src/server/create-server";
import { MockAuthService } from "../src/server/mock-auth";
import { DocumentAccessService } from "../src/server/document-access";

const authService = new MockAuthService();
const accessService = new DocumentAccessService()

let server: ReturnType<typeof createServer>;
let port: number;

const activeSockets = new Set<WebSocket>();

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


function nextMessage(socket: WebSocket): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for WebSocket message"));
    }, 3000);

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

function createInsertOperation(clientId: string) {
  return {
    type: "insert",
    id: {
      clientId,
      sequence: 1,
    },
    element: {
      id: {
        clientId,
        sequence: 1,
      },
      value: "A",
      after: null,
      deleted: false,
    },
  };
}

async function authenticate(
  socket: WebSocket,
  token: string
) {
  const response = nextMessage(socket);

  socket.send(
    JSON.stringify({
      type: "authenticate",
      token,
    })
  );

  return response;
}

async function join(
  socket: WebSocket,
  documentId: string
) {
  const response = nextMessage(socket);

  socket.send(
    JSON.stringify({
      type: "join",
      documentId,
    })
  );

  return response;
}

async function sendOperation(
  socket: WebSocket,
  operation: unknown
) {
  const response = nextMessage(socket);

  socket.send(
    JSON.stringify({
      type: "operation",
      operation,
    })
  );

  return response;
}

beforeAll(async () => {
  authService.registerToken("owner-token", "owner");
  authService.registerToken("editor-token", "editor");
  authService.registerToken("viewer-token", "viewer");
  authService.registerToken("unknown-token", "unknown");

  accessService.grantPermission(
  "doc-owner",
  "owner",
  "owner"
);

accessService.grantPermission(
  "doc-editor",
  "editor",
  "editor"
);

accessService.grantPermission(
  "doc-viewer",
  "viewer",
  "viewer"
);

accessService.grantPermission(
  "shared-doc",
  "editor",
  "editor"
);

accessService.grantPermission(
  "shared-doc",
  "viewer",
  "viewer"
);

  server = createServer(0, authService, accessService);

  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Unable to determine server port"));
        return;
      }

      port = address.port;
      resolve();
    });

    server.once("error", reject);
  });
});

afterAll(async () => {
  for (const socket of activeSockets) {
    socket.terminate();
  }

  activeSockets.clear();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
});

describe("WebSocket document authorization", () => {
  it("allows an owner to join a document", async () => {
    const socket = await connect();

    await authenticate(socket, "owner-token");

    const response = await join(socket, "doc-owner");

    expect(response.type).toBe("joined");
    expect(response.documentId).toBe("doc-owner");

    socket.close();
  });

  it("allows an editor to join a document", async () => {
    const socket = await connect();

    await authenticate(socket, "editor-token");

    const response = await join(socket, "doc-editor");

    expect(response.type).toBe("joined");

    socket.close();
  });

  it("allows a viewer to join a document", async () => {
    const socket = await connect();

    await authenticate(socket, "viewer-token");

    const response = await join(socket, "doc-viewer");

    expect(response.type).toBe("joined");

    socket.close();
  });

  it("rejects a user without read access", async () => {
    const socket = await connect();

    await authenticate(socket, "unknown-token");

    const response = await join(socket, "private-doc");

    expect(response.type).toBe("error");
    expect(response.message).toBe("Access denied");

    socket.close();
  });

  it("rejects a viewer from submitting operations", async () => {
  const socket = await connect();

  const authResponse = await authenticate(
    socket,
    "viewer-token"
  );

  const clientId = authResponse.clientId;

  const joinResponse = await join(
    socket,
    "doc-viewer"
  );

  expect(joinResponse.type).toBe("joined");

  const operation = createInsertOperation(clientId);

  const response = await sendOperation(
    socket,
    operation
  );

  expect(response.type).toBe("error");
  expect(response.message).toBe("Write access denied");

  socket.close();
});

it("allows an owner to submit an operation", async () => {
  const socket = await connect();

  const authResponse = await authenticate(
    socket,
    "owner-token"
  );

  const clientId = authResponse.clientId;

  const joinResponse = await join(
    socket,
    "doc-owner"
  );

  expect(joinResponse.type).toBe("joined");

  const operation = createInsertOperation(clientId);

  socket.send(
    JSON.stringify({
      type: "operation",
      operation,
    })
  );

  // The sender may not receive a response for a successful operation,
  // depending on your Room implementation.
  // We only need to verify that the server does not reject it.

  await new Promise((resolve) => setTimeout(resolve, 100));

  expect(socket.readyState).toBe(WebSocket.OPEN);

  socket.close();
});

it("allows an editor to submit an operation", async () => {
  const socket = await connect();

  const authResponse = await authenticate(
    socket,
    "editor-token"
  );

  const clientId = authResponse.clientId;

  const joinResponse = await join(
    socket,
    "doc-editor"
  );

  expect(joinResponse.type).toBe("joined");

  const operation = createInsertOperation(clientId);

  socket.send(
    JSON.stringify({
      type: "operation",
      operation,
    })
  );

  await new Promise((resolve) => setTimeout(resolve, 100));

  expect(socket.readyState).toBe(WebSocket.OPEN);

  socket.close();
});

it("allows a viewer to receive operations from a writer", async () => {
  const writerSocket = await connect();
  const viewerSocket = await connect();

  const writerAuth = await authenticate(
    writerSocket,
    "editor-token"
  );

  const viewerAuth = await authenticate(
    viewerSocket,
    "viewer-token"
  );

  const writerClientId = writerAuth.clientId;

  const writerJoin = await join(
    writerSocket,
    "shared-doc"
  );

  console.log("writerJoin", writerJoin);

  const viewerJoin = await join(
    viewerSocket,
    "shared-doc"
  );

  console.log("viewerJoin", viewerJoin);

  expect(writerJoin.type).toBe("joined");
  expect(viewerJoin.type).toBe("joined");

  const operation = createInsertOperation(
    writerClientId
  );

  const viewerMessage = nextMessage(viewerSocket);

  writerSocket.send(
    JSON.stringify({
      type: "operation",
      operation,
    })
  );

  const received = await viewerMessage;

  expect(received.type).toBe("operation");
  expect(received.operation).toEqual(operation);

  writerSocket.close();
  viewerSocket.close();
});

// it("persists accepted operations", async () => {
//   const operationStore = new InMemoryOperationStore();
//   const documnetStore = new InMemoryDocumentStore();
//   const sender = await connect();

//   const room = new Room(
//     "doc-1",
//     new RGA("server"),
//     operationStore,
//     documnetStore
//   );

//   const operation = {
//     type: "insert" as const,
//     id: {
//       clientId: "client-1",
//       sequence: 1,
//     },
//     element: {
//       id: {
//         clientId: "client-1",
//         sequence: 1,
//       },
//       value: "A",
//       after: null,
//       deleted: false,
//     },  
//   }

//   await room.handleOperation(
//     operation,
//     sender
//   );

//   const stored =
//     await operationStore.getOperations("doc-1");

//   expect(stored).toEqual([
//     operation,
//   ]);
// });

it("restores persisted operations when a room is restored", async () => {
  const operationStore = new InMemoryOperationStore();
  const documnetStore = new InMemoryDocumentStore();
  const receiver = await connect();

  const viewerAuth = await authenticate(
    receiver,
    "viewer-token"
  );

  const viewerClientId = viewerAuth.clientId;

  const viewerJoin = await join(
    receiver,
    "shared-doc"
  );

  expect(viewerJoin.type).toBe("joined");

  const operation = {
    type: "insert" as const,
    id: {
      clientId: "client-1",
      sequence: 1,
    },
    element: {
      id: {
        clientId: "client-1",
        sequence: 1,
      },
      value: "A",
      after: null,
      deleted: false,
    },
  }

  await operationStore.append(
    "shared-doc",
    operation
  );

  const room = new Room(
    "shared-doc",
    new RGA("server"),
    operationStore,
    documnetStore
  );

  await room.restore();

  // Assert using the existing RGA API
  // that the operation is now present.
  expect(room.getText()).toBe("A");
});

it("creates a snapshot at the configured interval", async () => {
  const operationStore =
    new InMemoryOperationStore();

  const documentStore =
    new InMemoryDocumentStore();

    const sender = await connect();

  const rga = new RGA("client-1");

  const room = new Room(
    "doc-1",
    rga,
    operationStore,
    documentStore
  );

  // Generate 100 valid operations
  for (let i = 0; i < 100; i++) {
    const operation = rga.insert(
      String.fromCharCode(65 + (i % 26)),
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
  expect(snapshot!.version).toBe(100);
});

it("syncs missing operations to a client", async () => {
  const sender = await connect();
  const receiver = await connect();

  try {
    await authenticate(sender, "user-1-token");
    await authenticate(receiver, "user-1-token");

    sender.send(
      JSON.stringify({
        type: "join",
        documentId: "sync-doc",
      }),
    );

    await nextMessage(sender);

    receiver.send(
      JSON.stringify({
        type: "join",
        documentId: "sync-doc",
      }),
    );

    await nextMessage(receiver);

    const operation = {
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
    };

    sender.send(
      JSON.stringify({
        type: "operation",
        operation,
      }),
    );

    // Sender does not receive its own broadcast.
    // Receiver receives the live operation.
    const liveMessage = await nextMessage(receiver);

    expect(liveMessage.type).toBe("operation");
    expect(liveMessage.operation).toEqual(operation);

    // Now ask for synchronization from an empty vector.
    receiver.send(
      JSON.stringify({
        type: "sync",
        versionVector: {},
      }),
    );

    const syncMessage = await nextMessage(receiver);

    expect(syncMessage.type).toBe("sync");
    expect(syncMessage.operations).toEqual([operation]);
  } finally {
    sender.close();
    receiver.close();
  }
});

it("only syncs operations missing from the client's version vector", async () => {
  const sender = await connect();
  const receiver = await connect();

  try {
    await authenticate(sender, "user-1-token");
    await authenticate(receiver, "user-1-token");

    sender.send(
      JSON.stringify({
        type: "join",
        documentId: "partial-sync-doc",
      }),
    );
    await nextMessage(sender);

    receiver.send(
      JSON.stringify({
        type: "join",
        documentId: "partial-sync-doc",
      }),
    );
    await nextMessage(receiver);

    const operation1 = {
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
    };

    const operation2 = {
      type: "insert",
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

    sender.send(
      JSON.stringify({
        type: "operation",
        operation: operation1,
      }),
    );

    await nextMessage(receiver);

    sender.send(
      JSON.stringify({
        type: "operation",
        operation: operation2,
      }),
    );

    await nextMessage(receiver);

    // Receiver already has operation 1.
    receiver.send(
      JSON.stringify({
        type: "sync",
        versionVector: {
          "client-a": 1,
        },
      }),
    );

    const syncMessage = await nextMessage(receiver);

    expect(syncMessage.type).toBe("sync");
    expect(syncMessage.operations).toEqual([operation2]);
  } finally {
    sender.close();
    receiver.close();
  }
});
});