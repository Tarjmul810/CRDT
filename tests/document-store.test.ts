import {
  describe,
  expect,
  it,
} from "vitest";

import { InMemoryDocumentStore } from "../src/server/memory-document-store";

describe("InMemoryDocumentStore", () => {
  it("stores and retrieves a snapshot", async () => {
    const store =
      new InMemoryDocumentStore();

    const snapshot = {
      documentId: "doc-1",
      state: {  
        elements: [],
        versionVector: {},
      },
      version: 10,
    };

    await store.saveSnapshot(snapshot);

    expect(
      await store.getSnapshot("doc-1")
    ).toEqual(snapshot);
  });

  it("returns null for an unknown document", async () => {
    const store =
      new InMemoryDocumentStore();

    expect(
      await store.getSnapshot("unknown")
    ).toBeNull();
  });

  it("keeps snapshots isolated between documents", async () => {
    const store =
      new InMemoryDocumentStore();

    await store.saveSnapshot({
      documentId: "doc-1",
      state: {
        elements: [],
        versionVector: {},
      },
      version: 5,
    });

    await store.saveSnapshot({
      documentId: "doc-2",
      state: {
        elements: [],
        versionVector: {},
      },
      version: 20,
    });

    expect(
      (await store.getSnapshot("doc-1"))?.version
    ).toBe(5);

    expect(
      (await store.getSnapshot("doc-2"))?.version
    ).toBe(20);
  });

  it("returns a copy of the snapshot", async () => {
    const store =
      new InMemoryDocumentStore();

    const snapshot = {
      documentId: "doc-1",
      state: {
        elements: [],
        versionVector: {},
      },
      version: 10,
    };

    await store.saveSnapshot(snapshot);

   
  });
});