import { describe, expect, it } from "vitest";
import type { DocumentOperation } from "../src/document/operations";
import { InMemoryDocumentOperationStore } from "../src/server/memory-document-operation-store";

describe("InMemoryDocumentOperationStore", () => {
  it("appends and retrieves document operations", async () => {
    const store = new InMemoryDocumentOperationStore();

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
      after: null,
    };

    const stored = await store.append(
      "doc-1",
      operation,
    );

    expect(stored.version).toBe(1);
    expect(stored.operation).toEqual(operation);

    const operations = await store.getOperations(
      "doc-1",
    );

    expect(operations).toHaveLength(1);
    expect(operations[0]).toEqual(stored);
  });

  it("assigns increasing versions", async () => {
    const store = new InMemoryDocumentOperationStore();

    const operation1: DocumentOperation = {
      type: "insert_block",
      id: {
        clientId: "client-a",
        sequence: 1,
      },
      block: {
        id: "block-1",
        type: "paragraph",
      },
      after: null,
    };

    const operation2: DocumentOperation = {
      type: "insert_block",
      id: {
        clientId: "client-a",
        sequence: 2,
      },
      block: {
        id: "block-2",
        type: "paragraph",
      },
      after: null,
    };

    const stored1 = await store.append(
      "doc-1",
      operation1,
    );

    const stored2 = await store.append(
      "doc-1",
      operation2,
    );

    expect(stored1.version).toBe(1);
    expect(stored2.version).toBe(2);
  });

  it("retrieves operations after a specific version", async () => {
    const store = new InMemoryDocumentOperationStore();

    const operation1: DocumentOperation = {
      type: "insert_block",
      id: {
        clientId: "client-a",
        sequence: 1,
      },
      block: {
        id: "block-1",
        type: "paragraph",
      },
      after: null,
    };

    const operation2: DocumentOperation = {
      type: "insert_block",
      id: {
        clientId: "client-a",
        sequence: 2,
      },
      block: {
        id: "block-2",
        type: "paragraph",
      },
      after: null,
    };

    await store.append("doc-1", operation1);
    await store.append("doc-1", operation2);

    const operations = await store.getOperations(
      "doc-1",
      1,
    );

    expect(operations).toHaveLength(1);
    expect(operations[0].operation).toEqual(
      operation2,
    );
  });

  it("finds an operation by its operation id", async () => {
    const store = new InMemoryDocumentOperationStore();

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
      after: null,
    };

    await store.append("doc-1", operation);

    const stored = await store.getOperation(
      "doc-1",
      operation.id,
    );

    expect(stored).not.toBeNull();
    expect(stored?.operation).toEqual(operation);
  });

  it("returns null when an operation does not exist", async () => {
    const store = new InMemoryDocumentOperationStore();

    const stored = await store.getOperation(
      "doc-1",
      {
        clientId: "client-a",
        sequence: 999,
      },
    );

    expect(stored).toBeNull();
  });

  it("does not duplicate the same operation", async () => {
    const store = new InMemoryDocumentOperationStore();

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
      after: null,
    };

    const first = await store.append(
      "doc-1",
      operation,
    );

    const second = await store.append(
      "doc-1",
      operation,
    );

    expect(first).toEqual(second);

    const operations = await store.getOperations(
      "doc-1",
    );

    expect(operations).toHaveLength(1);
    expect(operations[0]).toEqual(first);
  });

  it("keeps operations isolated between documents", async () => {
    const store = new InMemoryDocumentOperationStore();

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
      after: null,
    };

    await store.append("doc-1", operation);

    const doc1Operations =
      await store.getOperations("doc-1");

    const doc2Operations =
      await store.getOperations("doc-2");

    expect(doc1Operations).toHaveLength(1);
    expect(doc2Operations).toHaveLength(0);
  });
});