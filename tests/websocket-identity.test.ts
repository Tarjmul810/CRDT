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

function nextMessage(socket: WebSocket): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error("Timed out waiting for WebSocket message"),
      );
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

async function sendOperation(
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

  accessService.grantPermission(
    "doc-1",
    "user-1",
    "editor",
  );

  accessService.grantPermission(
    "sync-doc",
    "user-1",
    "editor",
  );

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
      const senderAck = await sendOperation(sender, operation);

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

      const ack1 = await sendOperation(
        sender,
        operation1,
      );

      expect(ack1.type).toBe("operation_ack");

      const live1 = await liveMessagePromise;

      expect(live1.operation).toEqual(
        operation1,
      );

      const liveMessagePromise2 = nextMessage(receiver);
      
      const ack2 = await sendOperation(
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
        await sendOperation(
          socket,
          operation,
        );

      expect(firstAck).toEqual({
        type: "operation_ack",
        operationId: operation.id,
      });

      // Retransmission of the exact same operation.
      const secondAck =
        await sendOperation(
          socket,
          operation,
        );

        console.log("secondAck", secondAck);

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

});

