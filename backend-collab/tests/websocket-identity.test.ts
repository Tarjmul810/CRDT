import {
  describe,
  expect,
  it,
  beforeAll,
  afterAll,
} from "vitest";
import WebSocket from "ws";

import { createServer } from "../src/server/create-server";
import { MockAuthService } from "../src/server/mock-auth";
import { DocumentAccessService } from "../src/server/document-access";
import type { InsertBlockOperation } from "../src/document/operations";

const authService = new MockAuthService();
const accessService = new DocumentAccessService();

const activeSockets = new Set<WebSocket>();

let server: ReturnType<typeof createServer>;
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

function nextMessage(socket: WebSocket, timeoutMs = 3000): Promise<any> {
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

function createInsertOperation(
  clientId: string,
  sequence: number,
  value: string,
  after: {
    clientId: string;
    sequence: number;
  } | null = null,
) {
  return {
    type: "insert" as const,
    id: {
      clientId,
      sequence,
    },
    element: {
      id: {
        clientId,
        sequence,
      },
      value,
      after,
      deleted: false,
    },
  };
}

async function sendRgaOperation(
  socket: WebSocket,
  operation: ReturnType<typeof createInsertOperation>,
) {
  const response = nextMessage(socket);

  socket.send(
    JSON.stringify({
      type: "operation",
      operation,
    }),
  );

  return response;
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

async function requestSync(
  socket: WebSocket,
  versionVector: Record<string, number>,
) {
  const response = nextMessage(socket);

  socket.send(
    JSON.stringify({
      type: "sync",
      versionVector,
    }),
  );

  return response;
}

beforeAll(async () => {
  authService.registerToken(
    "user-1-token",
    "user-1",
  );

  authService.registerToken("token-a", "user-a");
  authService.registerToken("token-b", "user-b");

  accessService.grantPermission(
    "doc-1",
    "user-1",
    "editor",
  );

  accessService.grantPermission("identity-doc", "user-1", "editor");

  accessService.grantPermission(
    "sync-doc",
    "user-1",
    "editor",
  );

  accessService.grantPermission("sync-doc", "user-b", "editor");
  accessService.grantPermission("sync-doc", "user-a", "editor");

  accessService.grantPermission(
    "partial-sync-doc",
    "user-1",
    "editor"
  );

  accessService.grantPermission(
    "retry-doc",
    "user-1",
    "editor",
  );

  accessService.grantPermission("doc-1", "user-a", "owner");
  accessService.grantPermission("doc-1", "user-b", "editor");

  accessService.grantPermission("retry-doc", "user-a", "editor");
  accessService.grantPermission("retry-doc", "user-b", "editor");

  accessService.grantPermission("viewer-doc", "user-a", "viewer");
  accessService.grantPermission("viewer-doc", "user-b", "viewer");

  server = createServer(
    0,
    authService,
    accessService,
  );

  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => {
      const address = server.address();

      if (
        !address ||
        typeof address === "string"
      ) {
        reject(
          new Error(
            "Unable to determine server port",
          ),
        );
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

describe("WebSocket server identity", () => {
  it("authenticates a valid token", async () => {
    const socket = await connect();

    try {
      const response = await authenticate(
        socket,
        "user-1-token",
      );

      expect(response.type).toBe("authenticated");
      expect(response.userId).toBe("user-1");
      expect(response.clientId).toEqual(
        expect.any(String),
      );
      expect(response.sessionId).toEqual(
        expect.any(String),
      );
    } finally {
      socket.close();
    }
  });

  it("rejects an invalid token", async () => {
    const socket = await connect();

    try {
      const response = await authenticate(
        socket,
        "invalid-token",
      );

      expect(response.type).toBe("error");
      expect(response.message).toBe(
        "Authentication failed",
      );
    } finally {
      socket.close();
    }
  });

  it("creates different client IDs for separate sessions", async () => {
    const firstSocket = await connect();
    const secondSocket = await connect();

    try {
      const firstResponse = await authenticate(
        firstSocket,
        "user-1-token",
      );

      const secondResponse = await authenticate(
        secondSocket,
        "user-1-token",
      );

      expect(firstResponse.userId).toBe("user-1");
      expect(secondResponse.userId).toBe("user-1");

      expect(firstResponse.clientId).not.toBe(
        secondResponse.clientId,
      );

      expect(firstResponse.sessionId).not.toBe(
        secondResponse.sessionId,
      );
    } finally {
      firstSocket.close();
      secondSocket.close();
    }
  });
});

describe("WebSocket synchronization", () => {
  it("syncs missing operations to a client", async () => {
    const sender = await connect();
    const receiver = await connect();

    try {
      const senderAuth = await authenticate(
        sender,
        "user-1-token",
      );

      const receiverAuth = await authenticate(
        receiver,
        "user-1-token",
      );

      const senderJoin = await joinDocument(
        sender,
        "sync-doc",
      );

      const receiverJoin = await joinDocument(
        receiver,
        "sync-doc",
      );

      expect(senderJoin).toEqual({
        type: "joined",
        documentId: "sync-doc",
      });

      expect(receiverJoin).toEqual({
        type: "joined",
        documentId: "sync-doc",
      });

      const operation = createInsertOperation(
        senderAuth.clientId,
        1,
        "H",
      );

      const liveMessagePromise = nextMessage(receiver);


      // Sender receives ACK.
      const senderAck = await sendRgaOperation(sender, operation);

      expect(senderAck).toEqual({
        type: "operation_ack",
        operationId: operation.id,
      });

      // Receiver receives the live broadcast.
      const liveMessage = await liveMessagePromise;

      expect(liveMessage).toEqual({
        type: "operation",
        operation,
      });

      // Ask for all operations from an empty vector.
      const syncMessage = await requestSync(
        receiver,
        {},
      );

      expect(syncMessage.type).toBe("sync");
      expect(syncMessage.operations).toEqual([
        operation,
      ]);
    } finally {
      sender.close();
      receiver.close();
    }
  });

  it("only syncs operations missing from the version vector", async () => {
    const sender = await connect();
    const receiver = await connect();

    try {
      const senderAuth = await authenticate(
        sender,
        "user-1-token",
      );

      const receiverAuth = await authenticate(
        receiver,
        "user-1-token",
      );

      await joinDocument(
        sender,
        "partial-sync-doc",
      );

      await joinDocument(
        receiver,
        "partial-sync-doc",
      );

      const operation1 = createInsertOperation(
        senderAuth.clientId,
        1,
        "H",
      );

      const operation2 = createInsertOperation(
        senderAuth.clientId,
        2,
        "i",
        {
          clientId: senderAuth.clientId,
          sequence: 1,
        },
      );

      const liveMessagePromise = nextMessage(receiver);

      const ack1 = await sendRgaOperation(
        sender,
        operation1,
      );

      expect(ack1.type).toBe("operation_ack");

      const live1 = await liveMessagePromise;

      expect(live1.operation).toEqual(
        operation1,
      );

      const liveMessagePromise2 = nextMessage(receiver);

      const ack2 = await sendRgaOperation(
        sender,
        operation2,
      );

      expect(ack2.type).toBe("operation_ack");

      const live2 = await liveMessagePromise2;

      expect(live2.operation).toEqual(
        operation2,
      );

      // Client already has A:1.
      const syncMessage = await requestSync(
        receiver,
        {
          [senderAuth.clientId]: 1,
        },
      );

      expect(syncMessage).toEqual({
        type: "sync",
        operations: [operation2],
      });
    } finally {
      sender.close();
      receiver.close();
    }
  });

  it("does not duplicate a retransmitted operation", async () => {
    const socket = await connect();

    try {
      const auth = await authenticate(
        socket,
        "user-1-token",
      );

      const joinMessage =
        await joinDocument(
          socket,
          "retry-doc",
        );

      expect(joinMessage).toEqual({
        type: "joined",
        documentId: "retry-doc",
      });

      const operation = createInsertOperation(
        auth.clientId,
        1,
        "H",
      );

      // First transmission.
      const firstAck =
        await sendRgaOperation(
          socket,
          operation,
        );

      expect(firstAck).toEqual({
        type: "operation_ack",
        operationId: operation.id,
      });

      // Retransmission of the exact same operation.
      const secondAck =
        await sendRgaOperation(
          socket,
          operation,
        )

      expect(secondAck).toEqual({
        type: "operation_ack",
        operationId: operation.id,
      });

      // The server must still have exactly one
      // persisted operation.
      const syncMessage =
        await requestSync(socket, {});

      expect(syncMessage.type).toBe("sync");
      expect(syncMessage.operations).toHaveLength(1);
      expect(syncMessage.operations[0]).toEqual(
        operation,
      );
    } finally {
      socket.close();
    }
  });

  it("handles document operations, broadcasts them, and ACKs the sender", async () => {
    const clientA = await connect();
    const clientB = await connect();

      // Authenticate both clients
      await authenticate(
        clientA,
        "token-a",
        "client-a",
      );

      await authenticate(
        clientB,
        "token-b",
        "client-b",
      );

      // Join the same document
      await joinDocument(clientA, "doc-1");
      await joinDocument(clientB, "doc-1");

      const operation = {
        type: "insert_block" as const,
        id: {
          clientId: "client-a",
          sequence: 1,
        },
        block: {
          id: "block-1",
          type: "paragraph" as const,
        },
        blockId: "block-1",
        operation: {
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
            value: "Hello",
            after: null,
            deleted: false,
          },
        },
        after: null,
      };

      // Start listening before sending the operation.
      // Otherwise B could receive the message before
      // nextMessage() starts waiting for it.
      const liveMessagePromise = nextMessage(clientB);

      // Send operation from A.
      // This helper already waits for the sender's ACK.
      const sendBlockOperationResponse =
        await sendBlockOperation(
          clientA,
          operation,
        );

      // A should receive an ACK.
      expect(sendBlockOperationResponse).toEqual({
        type: "document_operation_ack",
        operationId: operation.id,
      });

      // B should receive the actual document operation.
      const liveMessage = await liveMessagePromise;

      expect(liveMessage).toEqual({
        type: "document_operation",
        operation,
      });

      clientA.close();
      clientB.close();
  });

  it("rejects document operations from a viewer", async () => {
  const socket = await connect();

  try {
    await authenticate(
      socket,
      "token-a",
    );

    const joinMessage = await joinDocument(
      socket,
      "viewer-doc",
    );

    expect(joinMessage).toEqual({
      type: "joined",
      documentId: "viewer-doc",
    });

    const operation = {
      type: "insert_block" as const,
      id: {
        clientId: "viewer-client",
        sequence: 1,
      },
      block: {
        id: "block-1",
        type: "paragraph" as const,
      },
      blockId: "block-1",
      operation: {
        type: "insert" as const,
        id: {
          clientId: "viewer-client",
          sequence: 1,
        },
        element: {
          id: {
            clientId: "viewer-client",
            sequence: 1,
          },
          value: "Hello",
          after: null,
          deleted: false,
        },
      },
      after: null,
    };

    const response = await sendBlockOperation(
      socket,
      operation,
    );

    expect(response).toEqual({
      type: "error",
      message: "Write access denied",
    });
  } finally {
    socket.close();
  }
});

it("rejects a document operation with an invalid client identity", async () => {
  const socket = await connect();

  try {
    await authenticate(
      socket,
      "user-1-token"
    );

    const joinMessage = await joinDocument(
      socket,
      "identity-doc",
    );

    expect(joinMessage).toEqual({
      type: "joined",
      documentId: "identity-doc",
    });

    const operation = {
      type: "insert_block" as const,
      id: {
        clientId: "client-b",
        sequence: 1,
      },
      block: {
        id: "block-1",
        type: "paragraph" as const,
      },
      blockId: "block-1",
      operation: {
        type: "insert" as const,
        id: {
          clientId: "client-b",
          sequence: 1,
        },
        element: {
          id: {
            clientId: "client-b",
            sequence: 1,
          },
          value: "Hello",
          after: null,
          deleted: false,
        },
      },
      after: null,
    };

    const response = await sendBlockOperation(
      socket,
      operation,
    );

    expect(response).toEqual({
      type: "error",
      message: "Invalid operation identity",
    });
  } finally {
    socket.close();
  }
});

it("rejects a document operation before joining a document", async () => {
  const socket = await connect();

  try {
    const auth = await authenticate(
      socket,
      "user-1-token",
    );

    const operation = {
      type: "insert_block" as const,
      id: {
        clientId: auth.clientId,
        sequence: 1,
      },
      block: {
        id: "block-1",
        type: "paragraph" as const,
      },
      blockId: "block-1",
      operation: {
        type: "insert" as const,
        id: {
          clientId: auth.clientId,
          sequence: 1,
        },
        element: {
          id: {
            clientId: auth.clientId,
            sequence: 1,
          },
          value: "Hello",
          after: null,
          deleted: false,
        },
      },
      after: null,
    };

    const response = await sendBlockOperation(
      socket,
      operation,
    );

    expect(response).toEqual({
      type: "error",
      message: "Join a document first",
    });
  } finally {
    socket.close();
  }
});

it("rejects a new document operation with an invalid sequence", async () => {
  const socket = await connect();

  try {
    const auth = await authenticate(
      socket,
      "user-1-token",
    );

    await joinDocument(
      socket,
      "identity-doc",
    );

    const firstOperation = {
      type: "insert_block" as const,
      id: {
        clientId: auth.clientId,
        sequence: 1,
      },
      block: {
        id: "block-1",
        type: "paragraph" as const,
      },
      blockId: "block-1",
      operation: {
        type: "insert" as const,
        id: {
          clientId: auth.clientId,
          sequence: 1,
        },
        element: {
          id: {
            clientId: auth.clientId,
            sequence: 1,
          },
          value: "Hello",
          after: null,
          deleted: false,
        },
      },
      after: null,
    };

    const firstResponse = await sendBlockOperation(
      socket,
      firstOperation,
    );

    expect(firstResponse).toEqual({
      type: "document_operation_ack",
      operationId: firstOperation.id,
    });

    const secondOperation = {
      type: "insert_block" as const,
      id: {
        clientId: auth.clientId,
        sequence: 1,
      },
      block: {
        id: "block-2",
        type: "paragraph" as const,
      },
      blockId: "block-2",
      operation: {
        type: "insert" as const,
        id: {
          clientId: auth.clientId,
          sequence: 1,
        },
        element: {
          id: {
            clientId: auth.clientId,
            sequence: 1,
          },
          value: "Hello",
          after: null,
          deleted: false,
        },
      },
      after: null,
    };

    const secondResponse = await sendBlockOperation(
      socket,
      secondOperation,
    );

    expect(secondResponse).toEqual({
      type: "document_operation_ack",
      operationId: secondOperation.id,
    });
  } finally {
    socket.close();
  }
});

it("does not duplicate a retransmitted document operation", async () => {
  const socketA = await connect();
  const socketB = await connect();

  try {
    const authA = await authenticate(
      socketA,
      "token-a",
    );

    await authenticate(
      socketB,
      "token-b",
    );

    await joinDocument(
      socketA,
      "retry-doc",
    );

    await joinDocument(
      socketB,
      "retry-doc",
    );

    const operation = {
      type: "insert_block" as const,
      id: {
        clientId: authA.clientId,
        sequence: 1,
      },
      block: {
        id: "block-1",
        type: "paragraph" as const,
      },
      blockId: "block-1",
      operation: {
        type: "insert" as const,
        id: {
          clientId: authA.clientId,
          sequence: 1,
        },
        element: {
          id: {
            clientId: authA.clientId,
            sequence: 1,
          },
          value: "Hello",
          after: null,
          deleted: false,
        },
      },
      after: null,
    };

    // First transmission.
    const firstBroadcastPromise =
      nextMessage(socketB);

    const firstAck =
      await sendBlockOperation(
        socketA,
        operation,
      );

    expect(firstAck).toEqual({
      type: "document_operation_ack",
      operationId: operation.id,
    });

    expect(
      await firstBroadcastPromise,
    ).toEqual({
      type: "document_operation",
      operation,
    });

    // Second transmission of the exact same operation.
    const secondAck =
      await sendBlockOperation(
        socketA,
        operation,
      );

    expect(secondAck).toEqual({
      type: "document_operation_ack",
      operationId: operation.id,
    });

    // B must NOT receive the operation again.
    await expect(
      nextMessage(socketB, 100),
    ).rejects.toThrow();
  } finally {
    socketA.close();
    socketB.close();
  }
});

it("syncs existing document operations", async () => {
  const socketA = await connect();
  const socketB = await connect();

  try {
    const authA = await authenticate(
      socketA,
      "token-a",
    );

    await authenticate(
      socketB,
      "token-b",
    );

    await joinDocument(
      socketA,
      "sync-doc",
    );

    await joinDocument(
      socketB,
      "sync-doc",
    );

    const operation = {
      type: "insert_block" as const,
      id: {
        clientId: authA.clientId,
        sequence: 1,
      },
      block: {
        id: "block-1",
        type: "paragraph" as const,
      },
      blockId: "block-1",
      operation: {
        type: "insert" as const,
        id: {
          clientId: authA.clientId,
          sequence: 1,
        },
        element: {
          id: {
            clientId: authA.clientId,
            sequence: 1,
          },
          value: "Hello",
          after: null,
          deleted: false,
        },
      },
      after: null,
    };

    // Persist the operation through the normal
    // document-operation path.
    const ack = await sendBlockOperation(
      socketA,
      operation,
    );

    expect(ack).toEqual({
      type: "document_operation_ack",
      operationId: operation.id,
    });

    // Request document sync from B.
    socketB.send(
      JSON.stringify({
        type: "document_sync_request",
        afterVersion: 0,
      }),
    );

    const syncMessage =
      await nextMessage(socketB);

    expect(syncMessage).toEqual({
      type: "document_sync",
      operations: [
        {
          version: 1,
          operation,
        },
      ],
    });
  } finally {
    socketA.close();
    socketB.close();
  }
});

});

