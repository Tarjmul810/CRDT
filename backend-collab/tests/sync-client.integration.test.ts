import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { SyncClient } from "../src/client/sync-client";
import { SyncState } from "../src/client/sync-state";
import { MockAuthService } from "../src/server/mock-auth";
import { DocumentAccessService } from "../src/server/document-access";
import { createServer } from "../src/server/create-server";
import { InMemoryLocalStore } from "../src/client/memory-local-store";

describe("SyncClient integration", () => {
  const authService = new MockAuthService();
  const accessService = new DocumentAccessService();

  let server: ReturnType<typeof createServer>;

  beforeAll(() => {
    authService.registerToken(
      "user-1-token",
      "user-1",
    );

    accessService.grantPermission(
      "sync-client-doc",
      "user-1",
      "editor",
    );

    accessService.grantPermission(
      "sync-client-reconnect-doc",
      "user-1",
      "editor",
    );

    server = createServer(
      0,
      authService,
      accessService,
    );
  });

  afterAll(() => {
    server.close();
  });

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const address = server.address();
      const port =
        typeof address === "object" && address !== null
          ? address.port
          : 0;
      const socket = new WebSocket(
        `ws://localhost:${port}`,
      );

      socket.once("open", () => {
        resolve(socket);
      });

      socket.once("error", reject);
    });
  }

  function nextMessage(
    socket: WebSocket,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error("Timed out waiting for message"),
        );
      }, 3000);

      socket.once("message", (data) => {
        clearTimeout(timeout);

        try {
          resolve(JSON.parse(data.toString()));
        } catch (error) {
          reject(error);
        }
      });

      socket.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  function nextMessageOfType(
    socket: WebSocket,
    type: string,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.off("message", handler);
        reject(
          new Error(
            `Timed out waiting for ${type} message`,
          ),
        );
      }, 3000);

      const handler = (data: Buffer) => {
        try {
          const message = JSON.parse(
            data.toString(),
          );

          if (message.type !== type) {
            return;
          }

          clearTimeout(timeout);
          socket.off("message", handler);
          resolve(message);
        } catch (error) {
          clearTimeout(timeout);
          socket.off("message", handler);
          reject(error);
        }
      };

      socket.on("message", handler);
    });
  }

  async function authenticate(
    socket: WebSocket,
    clientId?: string,
  ) {
    const response = nextMessage(socket);

    socket.send(
      JSON.stringify({
        type: "authenticate",
        token: "user-1-token",
        ...(clientId ? { clientId } : {}),
      }),
    );

    return response;
  }

  async function joinDocument(
    socket: WebSocket,
    documentId?: string,
  ) {
    const response = nextMessage(socket);

    socket.send(
      JSON.stringify({
        type: "join",
        documentId
      }),
    );

    return response;
  }

  it(
    "sends a local operation and receives an ACK",
    async () => {
      const socket = await connect();

      try {
        const auth = await authenticate(socket);

        expect(auth.type).toBe("authenticated");

        const documentId = "sync-client-doc";

        const joinMessage =
          await joinDocument(socket, documentId);

        expect(joinMessage).toEqual({
          type: "joined",
          documentId: "sync-client-doc",
        });

        const state = new SyncState(
          auth.clientId,
        );

        const localStore = new InMemoryLocalStore();

        const client = new SyncClient(
          socket,
          state,
          localStore,
          "doc-1"
        );

        const operationMessage = nextMessage(socket);

        const operation = client.insert(
          "H",
          null,
        );

        const message = await operationMessage;

        expect(message).toEqual({
          type: "operation_ack",
          operationId: operation.id,
        });

        expect(client.getPendingOperationCount()).toBe(0);

        expect(client.getText()).toBe("H");

        expect(client.getVersionVector()).toEqual({
          [auth.clientId]: 1,
        });

        expect(client.getPendingOperationCount()).toBe(0);
      } finally {
        socket.close();
      }
    },
  );

  it(
    "retransmits a pending operation after reconnect",
    async () => {
      const socket1 = await connect();

      let socket2: WebSocket | undefined;

      try {
        const auth = await authenticate(socket1);

        expect(auth.type).toBe("authenticated");

        const documentId = "sync-client-doc";

        const joinMessage =
          await joinDocument(socket1, documentId);

        expect(joinMessage).toEqual({
          type: "joined",
          documentId: "sync-client-doc",
        });

        const state = new SyncState(
          auth.clientId,
        );

        const localStore = new InMemoryLocalStore();

        const client = new SyncClient(
          socket1,
          state,
          localStore,
          "doc-1"
        );

        socket1.close();

        /*
         * The client is now disconnected.
         * insert() should queue the operation rather
         * than send it.
         */
        const operation = client.insert(
          "H",
          null,
        );

        expect(
          client.getPendingOperationCount(),
        ).toBe(1);

        /*
         * Establish a completely new connection.
         */
        socket2 = await connect();

        const auth2 = await authenticate(
          socket2,
        );

        expect(auth2.clientId).not.toBe(
          auth.clientId,
        );

        /*
         * This is important: the SyncClient keeps
         * the original client identity in SyncState.
         *
         * For now, reconnecting the same logical client
         * with a new authenticated session is not yet
         * supported by our server identity model.
         */
      } finally {
        socket1.close();

        socket2?.close();
      }
    },
  );

  it(
    "reconnects and retransmits a pending operation",
    async () => {
      const socket1 = await connect();

      let socket2: WebSocket | undefined;

      try {
        // First connection
        const auth = await authenticate(
          socket1,
        );

        expect(auth.type).toBe(
          "authenticated",
        );

        const documentId =
          "sync-client-reconnect-doc";

        const joined = await joinDocument(
          socket1,
          documentId,
        );

        expect(joined).toEqual({
          type: "joined",
          documentId: "sync-client-reconnect-doc",
        });

        const state = new SyncState(
          auth.clientId,
        );

        const localStore = new InMemoryLocalStore();

        const client = new SyncClient(
          socket1,
          state,
          localStore,
          "doc-1"
        );

        /*
         * Simulate going offline.
         */
        socket1.close();

        /*
         * Create an operation while offline.
         *
         * SyncClient should keep it pending because
         * the socket is no longer open.
         */
        const operation = client.insert(
          "H",
          null,
        );

        expect(
          client.getPendingOperationCount(),
        ).toBe(1);

        /*
         * Establish a new WebSocket connection.
         */
        socket2 = await connect();

        /*
         * Re-authenticate using the SAME logical
         * clientId.
         */
        const reconnectAuth =
          await authenticate(
            socket2,
            auth.clientId,
          );

        expect(reconnectAuth.type).toBe(
          "authenticated",
        );

        expect(
          reconnectAuth.clientId,
        ).toBe(auth.clientId);

        /*
         * Join the document again.
         */
        const reconnectJoin =
          nextMessage(socket2);

        socket2.send(
          JSON.stringify({
            type: "join",
            documentId,
          }),
        );

        expect(
          await reconnectJoin,
        ).toEqual({
          type: "joined",
          documentId: "sync-client-reconnect-doc",
        });

        /*
         * Tell SyncClient about the new socket.
         */
        client.replaceSocket(socket2);

        /*
         * Wait for both messages generated by
         * reconnected():
         *
         * 1. sync response
         * 2. operation ACK
         */
        const syncPromise =
          nextMessageOfType(
            socket2,
            "sync",
          );

        const ackPromise =
          nextMessageOfType(
            socket2,
            "operation_ack",
          );

        client.reconnected();

        const syncMessage =
          await syncPromise;

        const ackMessage =
          await ackPromise;

        expect(syncMessage.type).toBe(
          "sync",
        );

        expect(ackMessage).toEqual({
          type: "operation_ack",
          operationId: operation.id,
        });

        /*
         * The retransmission has now been
         * acknowledged.
         */
        expect(
          client.getPendingOperationCount(),
        ).toBe(0);

        expect(client.getText()).toBe("H");
      } finally {
        socket1.close();
        socket2?.close();
      }
    },
  );

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
});