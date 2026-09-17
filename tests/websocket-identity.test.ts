
import {
  describe,
  expect,
  it,
  beforeAll,
  afterAll,
} from "vitest";

import WebSocket from "ws";

import { createServer } from "../src/server/create-server";

const PORT = 0;

let server: ReturnType<typeof createServer>;
let serverUrl: string;

function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server = createServer(PORT);

    const handleError = (error: Error) => {
      reject(error);
    };

    server.once("error", handleError);

    server.once("listening", () => {
      server.removeListener("error", handleError);

      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Could not determine server address"));
        return;
      }

      serverUrl = `ws://localhost:${address.port}`;

      resolve();
    });
  });
}

function connect(): Promise<{
  socket: WebSocket;
  clientId: string;
}> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(serverUrl);

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Connection timed out"));
    }, 3000);

    const handleError = (error: Error) => {
      clearTimeout(timeout);
      reject(error);
    };

    socket.once("error", handleError);

    socket.once("open", () => {
      socket.once("message", (data) => {
        clearTimeout(timeout);
        socket.removeListener("error", handleError);

        const message = JSON.parse(data.toString());

        if (
          message.type !== "connected" ||
          typeof message.clientId !== "string"
        ) {
          reject(new Error("Invalid connected message"));
          return;
        }

        resolve({
          socket,
          clientId: message.clientId,
        });
      });
    });
  });
}

function waitForMessage(
  socket: WebSocket
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error("Timed out waiting for WebSocket message")
      );
    }, 3000);

    const handleError = (error: Error) => {
      clearTimeout(timeout);
      reject(error);
    };

    socket.once("error", handleError);

    socket.once("message", (data) => {
      clearTimeout(timeout);
      socket.removeListener("error", handleError);

      resolve(JSON.parse(data.toString()));
    });
  });
}

describe("WebSocket server identity", () => {
  beforeAll(async () => {
    await startServer();
  }, 15000);

  afterAll(async () => {
    for (const client of server.clients) {
      client.terminate();
    }

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("assigns a client ID when connecting", async () => {
    const { socket, clientId } = await connect();

    expect(clientId).toBeTypeOf("string");
    expect(clientId.length).toBeGreaterThan(0);

    socket.close();
  });

  it("assigns different IDs to different connections", async () => {
    const first = await connect();
    const second = await connect();

    expect(first.clientId).not.toBe(second.clientId);

    first.socket.close();
    second.socket.close();
  });

  it("rejects an operation using another client's ID", async () => {
    const { socket, clientId } = await connect();

    socket.send(
      JSON.stringify({
        type: "join",
        documentId: "identity-test-document",
      })
    );

    // Wait for the server to process the join.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const operation = {
      type: "insert",
      id: {
        clientId: "fake-client",
        sequence: 1,
      },
      element: {
        id: {
          clientId: "fake-client",
          sequence: 1,
        },
        value: "X",
        after: null,
        deleted: false,
      },
    };

    socket.send(
      JSON.stringify({
        type: "operation",
        operation,
      })
    );

    const response = await waitForMessage(socket);

    expect(response).toEqual({
      type: "error",
      message: "Invalid operation identity",
    });

    expect(clientId).not.toBe("fake-client");

    socket.close();
  });
});