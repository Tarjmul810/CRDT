import { describe, expect, it } from "vitest";
import { InMemoryLocalStore } from "../src/client/memory-local-store";
import type { Operation } from "../src/crdt/type";
import type { DocumentOperation } from "../src/document/operations";

describe("InMemoryLocalStore", () => {
  it("saves and loads a document", async () => {
    const store = new InMemoryLocalStore();

    await store.saveDocument({
      documentId: "doc-1",
      state: {
        blockList: {
          elements: [],
          versionVector: {
            clientA: 1,
          },
        },
        contents: [],
      },
    });

    const document = await store.loadDocument("doc-1");

    expect(document).toEqual({
      documentId: "doc-1",
      state: {
        blockList: {
          elements: [],
          versionVector: {
            clientA: 1,
          },
        },
        contents: [],
      },
    });
  });

  it("returns null for an unknown document", async () => {
    const store = new InMemoryLocalStore();

    const document = await store.loadDocument("unknown");

    expect(document).toBeNull();
  });

  it("stores pending operations per document", async () => {
    const store = new InMemoryLocalStore();

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

    await store.savePendingOperation("doc-1", operationA);
    await store.savePendingOperation("doc-2", operationB);

    expect(
      await store.getPendingOperations("doc-1")
    ).toEqual([operationA]);

    expect(
      await store.getPendingOperations("doc-2")
    ).toEqual([operationB]);
  });

  it("removes a pending operation", async () => {
    const store = new InMemoryLocalStore();

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

    await store.savePendingOperation("doc-1", operation);

    await store.removePendingOperation("doc-1", {
      clientId: "clientA",
      sequence: 1,
    });

    expect(
      await store.getPendingOperations("doc-1")
    ).toEqual([]);
  });

  it("does not expose the stored pending operation array", async () => {
    const store = new InMemoryLocalStore();

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

    await store.savePendingOperation("doc-1", operation);

    const operations =
      await store.getPendingOperations("doc-1");

    operations.pop();

    expect(
      await store.getPendingOperations("doc-1")
    ).toEqual([operation]);
  });
  
});