import { describe, expect, it } from "vitest";
import { InMemoryLocalStore } from "./memory-local-store";
import type { Operation } from "../crdt/type";

describe("InMemoryLocalStore", () => {
  it("saves and loads a document", async () => {
    const store = new InMemoryLocalStore();

    await store.saveDocument({
      documentId: "doc-1",
      state: {
        elements: [],
        versionVector: {
          clientA: 2,
        },
      },
    });

    const document = await store.loadDocument("doc-1");

    expect(document).toEqual({
      documentId: "doc-1",
      state: {
        elements: [],
        versionVector: {
          clientA: 2,
        },
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

    const operationA: Operation = {
      type: "insert",
      id: {
        clientId: "clientA",
        sequence: 1,
      },
      element: {
        id: {
          clientId: "clientA",
          sequence: 1,
        },
        value: "H",
        after: null,
        deleted: false,
      },
    };

    const operationB: Operation = {
      type: "insert",
      id: {
        clientId: "clientB",
        sequence: 1,
      },
      element: {
        id: {
          clientId: "clientB",
          sequence: 1,
        },
        value: "i",
        after: null,
        deleted: false,
      },
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

    const operation: Operation = {
      type: "insert",
      id: {
        clientId: "clientA",
        sequence: 1,
      },
      element: {
        id: {
          clientId: "clientA",
          sequence: 1,
        },
        value: "H",
        after: null,
        deleted: false,
      },
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

    const operation: Operation = {
      type: "insert",
      id: {
        clientId: "clientA",
        sequence: 1,
      },
      element: {
        id: {
          clientId: "clientA",
          sequence: 1,
        },
        value: "H",
        after: null,
        deleted: false,
      },
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