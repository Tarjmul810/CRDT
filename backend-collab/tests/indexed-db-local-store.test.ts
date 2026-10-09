import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";

import { IndexedDBLocalStore } from "../src/client/indexed-db-local-store";
import type { Operation } from "../src/crdt/type";
import { DocumentState } from "../src/document/document-state";
import type { DocumentOperation } from "../src/document/operations";

describe("IndexedDBLocalStore", () => {
  beforeEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(
        "collaborative-workspace"
      );

      request.onsuccess = () => resolve();

      request.onerror = () => {
        reject(request.error);
      };

      request.onblocked = () => {
        reject(
          new Error(
            "IndexedDB deletion was blocked by an open connection"
          )
        );
      };
    });
  });

  it("saves and loads a document", async () => {
    const store = new IndexedDBLocalStore();

    await store.saveDocument({
      documentId: "doc-1",
      state: {
        blockList: {
          elements: [],
          versionVector: {
            "client-a": 1,
          },
        },
        contents: []
      }
    });

    const document = await store.loadDocument("doc-1");

    expect(document).toEqual({
      documentId: "doc-1",
      state: {
        blockList: {
          elements: [],
          versionVector: {
            "client-a": 1,
          },
        },
        contents: []
      }
    });

    store.close();
  });

  it("returns null for an unknown document", async () => {
    const store = new IndexedDBLocalStore();

    const document =
      await store.loadDocument("unknown");



    expect(document).toBeNull();
    store.close();
  });

  it("stores pending operations", async () => {
    const store = new IndexedDBLocalStore();

    const operation: DocumentOperation = {
      type: "insert_block",
      id: {
        clientId: "clientA",
        sequence: 1,
      },
      block: {
        id: "block-1",
        type: "paragraph",
      },
      after: null,
    };

    await store.savePendingOperation(
      "doc-1",
      operation
    );

    const operations =
      await store.getPendingOperations("doc-1");

    expect(operations).toEqual([operation]);

    store.close();
  });

  it("keeps pending operations isolated by document", async () => {
    const store = new IndexedDBLocalStore();

    const operationA: DocumentOperation = {
      type: "insert_block", 
      id: {
        clientId: "clientA",
        sequence: 1,
      },
      block: {
        id: "block-1",
        type: "paragraph",
      },
      after: null,
    };

    const operationB: DocumentOperation = {
      type: "insert_block",
      id: {
        clientId: "clientB",
        sequence: 1,
      },
      block: {
        id: "block-2",
        type: "paragraph",
      },
      after: null,
    };

    await store.savePendingOperation(
      "doc-1",
      operationA
    );

    await store.savePendingOperation(
      "doc-2",
      operationB
    );

    expect(
      await store.getPendingOperations("doc-1")
    ).toEqual([operationA]);

    expect(
      await store.getPendingOperations("doc-2")
    ).toEqual([operationB]);

    store.close();
  });

  it("removes a pending operation", async () => {
    const store = new IndexedDBLocalStore();

    const operation: DocumentOperation = {
      type: "insert_block",
      id: {
        clientId: "clientA",
        sequence: 1,
      },
      block: {
        id: "block-1",
        type: "paragraph",
      },  
      after: null,  
    }

    await store.savePendingOperation(
      "doc-1",
      operation
    );

    await store.removePendingOperation(
      "doc-1",
      operation.id
    );

    expect(
      await store.getPendingOperations("doc-1")
    ).toEqual([]);

    store.close();
  });

  it("persists data across store instances", async () => {
    const store1 = new IndexedDBLocalStore();

    await store1.saveDocument({
      documentId: "doc-1",
      state: {
        blockList: {
          elements: [],
          versionVector: {
            "client-a": 3,
          },
        },
        contents: []
      }
    });

    const operation: DocumentOperation = {
      type: "insert_block",
      id: {
        clientId: "clientA",
        sequence: 3,
      },
      block: {
        id: "block-1",
        type: "paragraph",
      },
      after: null,
    }

    await store1.savePendingOperation(
      "doc-1",
      operation
    );

    // Simulate the first application/store instance going away.
    store1.close();

    const store2 = new IndexedDBLocalStore();

    const document =
      await store2.loadDocument("doc-1");

    const pendingOperations =
      await store2.getPendingOperations("doc-1");

    expect(document?.state.blockList.versionVector).toEqual({
      "client-a": 3,
    });

    expect(pendingOperations).toEqual([
      operation,
    ]);

    store2.close();
  });

  it("deep clones block content state", async () => {
    const store = new IndexedDBLocalStore();

    const document = new DocumentState("client-a");

    document.insertBlock(
      {
        id: "block-1",
        type: "paragraph",
      },
      null
    );

    document.insertText(
      "block-1",
      "Hello",
      null
    );

    const snapshot = document.serialize();

    await store.saveDocument({
      documentId: "doc-1",
      state: snapshot,
    });

    const loaded = await store.loadDocument("doc-1");

    expect(loaded).not.toBeNull();

    expect(
      loaded?.state.contents[0].blockId
    ).toBe("block-1");

    expect(
      loaded?.state.contents[0].state.elements
    ).toHaveLength(1);

    store.close();
  });

  it("persists a complete document snapshot", async () => {
    const store = new IndexedDBLocalStore();

    const document = new DocumentState("client-a");

    document.insertBlock(
      {
        id: "block-1",
        type: "paragraph",
      },
      null
    );

    document.insertText(
      "block-1",
      "Hello",
      null
    );

    const snapshot = document.serialize();

    await store.saveDocument({
      documentId: "doc-1",
      state: snapshot,
    });

    const loaded = await store.loadDocument("doc-1");

    expect(loaded).not.toBeNull();
    expect(loaded?.state).toEqual(snapshot);

    store.close();
  });

  it("persists a document across store instances", async () => {
    const store1 = new IndexedDBLocalStore();

    const document = new DocumentState("client-a");

    document.insertBlock(
      {
        id: "block-1",
        type: "paragraph",
      },
      null
    );

    document.insertText(
      "block-1",
      "Hello",
      null
    );

    await store1.saveDocument({
      documentId: "doc-1",
      state: document.serialize(),
    });

    store1.close();

    const store2 = new IndexedDBLocalStore();

    const loaded = await store2.loadDocument("doc-1");

    expect(loaded).not.toBeNull();

    const restored = new DocumentState("client-a");
    restored.restore(loaded!.state);

    expect(restored.blocks.getBlocks()).toEqual([
      {
        id: "block-1",
        type: "paragraph",
      },
    ]);

    expect(
      restored.getContent("block-1")?.getText()
    ).toBe("Hello");

    store2.close();
  });
});