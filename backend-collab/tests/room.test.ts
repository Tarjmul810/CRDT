import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import WebSocket from "ws";

import type { Operation } from "../src/crdt/type";
import { RGA } from "../src/crdt/rga";
import { Room } from "../src/server/room";
import { InMemoryOperationStore } from "../src/server/memory-operation-store";
import { InMemoryDocumentStore } from "../src/server/memory-document-store";
import { DocumentSession } from "../src/document/document-session";
import type { DocumentOperation } from "../src/document/operations";
import { InMemoryDocumentOperationStore } from "../src/server/memory-document-operation-store";

function createSender(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: () => {},
  } as unknown as WebSocket;
}

describe("Room", () => {
  it("persists an accepted operation", async () => {
    const operationStore =
      new InMemoryOperationStore();

    const documentStore =
      new InMemoryDocumentStore();

    const rga = new RGA("client-1");
    const documentSession = new DocumentSession("client-1");

    const documentOperationStore = new InMemoryDocumentOperationStore();

    const room = new Room(
      "doc-1",
      rga,
      operationStore,
      documentStore,
      documentSession,
      documentOperationStore
    );

    const sender = createSender();

    const operation = rga.insert(
      "A",
      null
    );

    await room.handleOperation(
      operation,
      sender
    );

    const stored =
      await operationStore.getOperations(
        "doc-1"
      );

    expect(stored).toHaveLength(1);

    expect(
      stored[0]?.operation
    ).toEqual(operation);

    expect(room.getText()).toBe("A");
  });

  it("creates a snapshot at the snapshot interval", async () => {
    const operationStore =
      new InMemoryOperationStore();

    const documentStore =
      new InMemoryDocumentStore();

    const rga = new RGA("client-1");
    const documentSession = new DocumentSession("client-1");

    const documentOperationStore = new InMemoryDocumentOperationStore();

    const room = new Room(
      "doc-1",
      rga,
      operationStore,
      documentStore,
      documentSession,
      documentOperationStore
    );

    const sender = createSender();

    for (let i = 0; i < 100; i++) {
      const operation = rga.insert(
        String.fromCharCode(
          65 + (i % 26)
        ),
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

    expect(
      snapshot!.version
    ).toBe(100);

    expect(
      snapshot!.state.elements
    ).toHaveLength(100);
  });

  it("restores a room from a snapshot and later operations", async () => {
  const operationStore =
    new InMemoryOperationStore();

  const documentStore =
    new InMemoryDocumentStore();

  const originalRga =
    new RGA("client-1");

    const documentSession = new DocumentSession("client-1");

    const documentOperationStore = new InMemoryDocumentOperationStore();

  const originalRoom = new Room(
    "doc-1",
    originalRga,
    operationStore,
    documentStore,
    documentSession,
    documentOperationStore
  );

  const sender = createSender();

  for (let i = 0; i < 100; i++) {
    const operation = originalRga.insert(
      String.fromCharCode(
        65 + (i % 26)
      ),
      null
    );

    await originalRoom.handleOperation(
      operation,
      sender
    );
  }

  expect(
    await documentStore.getSnapshot("doc-1")
  ).not.toBeNull();

  // Operation 101 happens after the snapshot.
  const operation101 =
    originalRga.insert("Z", null);

  await originalRoom.handleOperation(
    operation101,
    sender
  );

  const expectedText =
    originalRoom.getText();

  // Simulate a new Room instance.
  const restoredRga =
    new RGA("restored-client");

    const documentSession1 = new DocumentSession("restored-client");

  const restoredRoom = new Room(
    "doc-1",
    restoredRga,
    operationStore,
    documentStore,
    documentSession1,
    documentOperationStore
  );

  await restoredRoom.restore();

  expect(
    restoredRoom.getText()
  ).toBe(expectedText);
});

it("restores only operations after the snapshot version", async () => {
  const operationStore =
    new InMemoryOperationStore();

  const documentStore =
    new InMemoryDocumentStore();

  const originalRga =
    new RGA("client-1");

    const documentSession = new DocumentSession("client-1");
    const documentOperationStore = new InMemoryDocumentOperationStore();

  const room = new Room(
    "doc-1",
    originalRga,
    operationStore,
    documentStore,
    documentSession,
    documentOperationStore
  );

  const sender = createSender();

  for (let i = 0; i < 100; i++) {
    const operation = originalRga.insert(
      String.fromCharCode(
        65 + (i % 26)
      ),
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

  expect(snapshot!.version).toBe(100);

  const operation101 =
    originalRga.insert("Z", null);

  await room.handleOperation(
    operation101,
    sender
  );

  const operations =
    await operationStore.getOperations(
      "doc-1",
      snapshot!.version
    );

  expect(operations).toHaveLength(1);

  expect(
    operations[0]?.version
  ).toBe(101);

  expect(
    operations[0]?.operation
  ).toEqual(operation101);
});

it("does not apply or broadcast a duplicate operation", async () => {
  const operationStore =
    new InMemoryOperationStore();

  const documentStore =
    new InMemoryDocumentStore();

  const rga = new RGA("server");
  const documentSession = new DocumentSession("server");
  const documentOperationStore = new InMemoryDocumentOperationStore();

  const room = new Room(
    "duplicate-doc",
    rga,
    operationStore,
    documentStore,
    documentSession,
    documentOperationStore
  );

  const sender = {
    readyState: WebSocket.OPEN,
  } as WebSocket;

  const receiver = {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;

  room.addClient(sender);
  room.addClient(receiver);

  const operation: Operation = {
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

  await room.handleOperation(
    operation,
    sender,
  );

  await room.handleOperation(
    operation,
    sender,
  );

  expect(room.getText()).toBe("H");

  expect(receiver.send).toHaveBeenCalledTimes(1);
});

it("applies a document operation through the document session", () => {
  const operationStore =
    new InMemoryOperationStore();

  const documentStore =
    new InMemoryDocumentStore();

    const documentSession = new DocumentSession("client-a");

    const documentOperationStore = new InMemoryDocumentOperationStore();

  const room = new Room(
    "doc-1",
    new RGA("client-a"),
    operationStore,
    documentStore,
    documentSession,
    documentOperationStore
  );

  room.applyDocumentOperation({
    type: "insert_block",
    id: {
      clientId: "client-a",
      sequence: 1,
    },
    block: {
      id: "block-1",
      type: "paragraph",
    },
    blockId: "block-1",
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
        value: JSON.stringify({
          id: "block-1",
          type: "paragraph",
        }),
        after: null,
        deleted: false,
      },
    },
    after: null,
  });

  const snapshot = room.getDocumentSnapshot();

  expect(snapshot.blockList.elements).toHaveLength(1);

  expect(snapshot.blockList.elements[0].value).toBe(
  JSON.stringify({
    id: "block-1",
    type: "paragraph",
  })
);
});

it("broadcasts a document operation to other clients", () => {
  const operationStore =
    new InMemoryOperationStore();

  const documentStore = new InMemoryDocumentStore();
  const documentSession = new DocumentSession("client-a");
  const documentOperationStore = new InMemoryDocumentOperationStore();
  
  const room = new Room(
    "document-1",
    new RGA("client-a"),
    operationStore,
    documentStore,
    documentSession,
    documentOperationStore
  );

  const clientA = {
    readyState: 1,
    send: vi.fn(),
  } as unknown as WebSocket;

  const clientB = {
    readyState: 1,
    send: vi.fn(),
  } as unknown as WebSocket;

  // Use your existing Room client-registration method here.
  room.addClient(clientA);
  room.addClient(clientB);

  const operation: DocumentOperation = {
    type: "insert_block",
    id: {
      clientId: "client-a",
      sequence: 1,
    },
    block: {
      id: "block-1",
      type: "paragraph",
    },
    blockId: "block-1",
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
        value: JSON.stringify({
          id: "block-1",
          type: "paragraph",
        }),
        after: null,
        deleted: false,
      },
    },
    after: null,
  };

  room.broadcastDocumentOperation(
    operation,
    clientA
  );

  expect(clientA.send).not.toHaveBeenCalled();

  expect(clientB.send).toHaveBeenCalledTimes(1);

  expect(clientB.send).toHaveBeenCalledWith(
    JSON.stringify({
      type: "document_operation",
      operation,
    })
  );
});

it("applies a document operation before broadcasting", () => {
  const operationStore =
    new InMemoryOperationStore();
  const documentStore = new InMemoryDocumentStore();
  const documentSession = new DocumentSession("client-a");
  const documentOperationStore = new InMemoryDocumentOperationStore();
  const room = new Room(
    "document-1",
    new RGA("client-a"),
    operationStore,
    documentStore,
    documentSession,
    documentOperationStore
  );

  const operation: DocumentOperation = {
    type: "insert_block",
    id: {
      clientId: "client-a",
      sequence: 1,
    },
    block: {
      id: "block-1",
      type: "paragraph",
    },
    blockId: "block-1",
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
        value: JSON.stringify({
          id: "block-1",
          type: "paragraph",
        }),
        after: null,
        deleted: false,
      },
    },

    after: null,
  };

  room.applyDocumentOperation(operation);

  const snapshot = room.getDocumentSnapshot();

  expect(snapshot.blockList.elements).toHaveLength(1);

  expect(
    JSON.parse(snapshot.blockList.elements[0].value)
  ).toEqual({
    id: "block-1",
    type: "paragraph",
  });
});

it("applies and persists a document operation", async () => {
  const operationStore =
    new InMemoryOperationStore();

  const documentStore =
    new InMemoryDocumentStore();

  const documentSession =
    new DocumentSession("client-a");

  const documentOperationStore =
    new InMemoryDocumentOperationStore();

  const room = new Room(
    "document-1",
    new RGA("client-a"),
    operationStore,
    documentStore,
    documentSession,
    documentOperationStore,
  );

  const operation: DocumentOperation = {
    type: "insert_block",
    id: {
      clientId: "client-a",
      sequence: 1,
    },
    block: {
      id: "block-1",
      type: "paragraph",
    },
    blockId: "block-1",
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
        value: JSON.stringify({
          id: "block-1",
          type: "paragraph",
        }),
        after: null,
        deleted: false,
      },
    },
    after: null,
  };

  const stored =
    await room.handleDocumentOperation(
      operation,
    );

  expect(stored.version).toBe(1);
  expect(stored.operation).toEqual(operation);

  const operations =
    await documentOperationStore.getOperations(
      "document-1",
    );

  expect(operations).toHaveLength(1);
  expect(operations[0]).toEqual(stored);

  const snapshot =
    room.getDocumentSnapshot();

  expect(
    snapshot.blockList.elements,
  ).toHaveLength(1);
});

it("does not duplicate a retransmitted document operation", async () => {
  const operationStore =
    new InMemoryOperationStore();

  const documentStore =
    new InMemoryDocumentStore();

  const documentSession =
    new DocumentSession("client-a");

  const documentOperationStore =
    new InMemoryDocumentOperationStore();

  const room = new Room(
    "document-1",
    new RGA("client-a"),
    operationStore,
    documentStore,
    documentSession,
    documentOperationStore,
  );

  const operation: DocumentOperation = {
    type: "insert_block",
    id: {
      clientId: "client-a",
      sequence: 1,
    },
    block: {
      id: "block-1",
      type: "paragraph",
    },
    blockId: "block-1",
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
        value: JSON.stringify({
          id: "block-1",
          type: "paragraph",
        }),
        after: null,
        deleted: false,
      },
    },
    after: null,
  };

  const first =
    await room.handleDocumentOperation(
      operation,
    );

  const second =
    await room.handleDocumentOperation(
      operation,
    );

  expect(first).toEqual(second);

  const operations =
    await documentOperationStore.getOperations(
      "document-1",
    );

  expect(operations).toHaveLength(1);

  const snapshot =
    room.getDocumentSnapshot();

  expect(
    snapshot.blockList.elements,
  ).toHaveLength(1);
});

it("handles a document text operation", async () => {
  const operationStore =
    new InMemoryOperationStore();

  const documentStore =
    new InMemoryDocumentStore();

  const documentSession =
    new DocumentSession("client-a");

  const documentOperationStore =
    new InMemoryDocumentOperationStore();

  const room = new Room(
    "document-1",
    new RGA("client-a"),
    operationStore,
    documentStore,
    documentSession,
    documentOperationStore,
  );

  const blockOperation: DocumentOperation = {
    type: "insert_block",
    id: {
      clientId: "client-a",
      sequence: 1,
    },
    block: {
      id: "block-1",
      type: "paragraph",
    },
    blockId: "block-1",
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
        value: JSON.stringify({
          id: "block-1",
          type: "paragraph",
        }),
        after: null,
        deleted: false,
      },
    },
    after: null,
  };

  await room.handleDocumentOperation(
    blockOperation,
  );

  const textOperation: DocumentOperation = {
    type: "insert_text",
    id: {
      clientId: "client-a",
      sequence: 2,
    },
    blockId: "block-1",
    operation: {
      type: "insert",
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

  await room.handleDocumentOperation(
    textOperation,
  );

  const content =
    documentSession.state.getContent(
      "block-1",
    );

  expect(content).toBeDefined();
  expect(content?.getText()).toBe("Hello");

  const operations =
    await documentOperationStore.getOperations(
      "document-1",
    );

  expect(operations).toHaveLength(2);
});
});