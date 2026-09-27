import { describe, expect, it } from "vitest";
import { SyncClient } from "../src/client/sync-client";
import { SyncState } from "../src/client/sync-state";

function createFakeSocket() {
  return {
    sent: [] as string[],

    send(message: string) {
      this.sent.push(message);
    },

    readyState: 1,
  };
}

describe("SyncClient", () => {
  it("requests sync using its current version vector", () => {
    const socket = createFakeSocket();
    const state = new SyncState("client-a");
    const client = new SyncClient(socket as any, state);

    state.insert("H", null);

    client.requestSync();

    expect(JSON.parse(socket.sent[0]!)).toEqual({
      type: "sync",
      versionVector: {
        "client-a": 1,
      },
    });
  });

  it("applies synchronized operations", () => {
    const socket = createFakeSocket();
    const state = new SyncState("client-b");
    const client = new SyncClient(socket as any, state);

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
    const client = new SyncClient(socket as any, state);

    const operation = client.insert("H", null);

    expect(JSON.parse(socket.sent[0]!)).toEqual({
      type: "operation",
      operation,
    });

    expect(client.getText()).toBe("H");
  });

  it("queues local operations while disconnected", () => {
  const socket = createFakeSocket();

  socket.readyState = 0;

  const state = new SyncState("client-a");
  const client = new SyncClient(socket as any, state);

  const operation = client.insert("H", null);

  expect(socket.sent).toHaveLength(0);
  expect(client.getText()).toBe("H");

  socket.readyState = 1;

  client.reconnected();

  console.log("sent", socket.sent)

  expect(socket.sent).toHaveLength(2);

  expect(JSON.parse(socket.sent[0]!)).toEqual({
    type: "sync",
    versionVector: {
      "client-a": 1,
    },
  });

  expect(JSON.parse(socket.sent[1]!)).toEqual({
    type: "operation",
    operation,
  });
});

it("resyncs after being offline while remote operations were created", () => {
  const socket = createFakeSocket();
  const state = new SyncState("client-b");
  const client = new SyncClient(socket as any, state);

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
  client.reconnected();

  expect(socket.sent).toHaveLength(2);

  const syncMessage = JSON.parse(socket.sent[0]!);

  expect(syncMessage).toEqual({
    type: "sync",
    versionVector: {
      "client-a": 1,
      "client-b": 1,
    },
  });

  const operationMessage = JSON.parse(socket.sent[1]!);

  expect(operationMessage).toEqual({
    type: "operation",
    operation: localOperation,
  });
});

it("keeps an operation pending until the server acknowledges it", () => {
  const socket = createFakeSocket();
  const state = new SyncState("client-a");
  const client = new SyncClient(socket as any, state);

  const operation = client.insert("H", null);

  expect(socket.sent).toHaveLength(1);

  // Simulate reconnect/flush before acknowledgement.
  client.reconnected();

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
  client.reconnected();

  expect(socket.sent).toHaveLength(4);

  const lastMessage = JSON.parse(socket.sent[3]!);

  expect(lastMessage).toEqual({
    type: "sync",
    versionVector: {
      "client-a": 1,
    },
  });
});
});