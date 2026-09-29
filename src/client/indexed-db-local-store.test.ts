import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";

import { IndexedDBLocalStore } from "./indexed-db-local-store";
import type { Operation } from "../crdt/type";

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
                elements: [],
                versionVector: {
                    "client-a": 1,
                },
            },
        });

        const document = await store.loadDocument("doc-1");

        expect(document).toEqual({
            documentId: "doc-1",
            state: {
                elements: [],
                versionVector: {
                    "client-a": 1,
                },
            },
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

        const operationA: Operation = {
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
        };

        const operationB: Operation = {
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
            value: "B",
            after: null,
            deleted: false,
          },
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
      elements: [],
      versionVector: {
        "client-a": 3,
      },
    },
  });

  const operation: Operation = {
    type: "insert",
    id: {
      clientId: "client-a",
      sequence: 3,
    },
    element: {
      id: {
        clientId: "client-a",
        sequence: 3,
      },
      value: "H",
      after: null,
      deleted: false,
    },
  };

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

  expect(document?.state.versionVector).toEqual({
    "client-a": 3,
  });

  expect(pendingOperations).toEqual([
    operation,
  ]);

  store2.close();
});
});