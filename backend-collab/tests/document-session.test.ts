import { describe, expect, it } from "vitest";
import { DocumentSession } from "../src/document/document-session";

it("applies a document operation", () => {
  const session = new DocumentSession("client-a");

  session.applyOperation({
    type: "insert_block",
    id: {
      clientId: "client-b",
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
        clientId: "client-b",
        sequence: 1,
      },
      element: {
        id: {
          clientId: "client-b",
          sequence: 1,
        },
        value: "Hello",
        after: null,
        deleted: false,
      },
    },
    after: null,
  });

  expect(session.state.blocks.getBlocks()).toEqual([
    {
      id: "block-1",
      type: "paragraph",
    },
  ]);
});

it("serializes and restores document state", () => {
  const session = new DocumentSession("client-a");

  session.applyOperation({
    type: "insert_block",
    id: {
      clientId: "client-b",
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
        clientId: "client-b",
        sequence: 1,
      },
      element: {
        id: {
          clientId: "client-b",
          sequence: 1,
        },
        value: "Hello",
        after: null,
        deleted: false,
      },
    },
    after: null,
  });

  const snapshot = session.serialize();

  const restored = new DocumentSession("client-a");

  restored.restore(snapshot);

  expect(restored.state.blocks.getBlocks()).toEqual([
    {
      id: "block-1",
      type: "paragraph",
    },
  ]);
});

describe("DocumentSession subscriptions", () => {
  it("notifies listeners when an operation is applied", () => {
    const session = new DocumentSession("client-a");

    let notifications = 0;

    const unsubscribe = session.subscribe(() => {
      notifications += 1;
    });

    const operation = session.state.insertBlock(
      {
        id: "block-1",
        type: "paragraph",
      },
      null,
    );

    session.applyOperation(operation);

    expect(notifications).toBe(1);

    unsubscribe();

    const secondOperation = session.state.insertBlock(
      {
        id: "block-2",
        type: "paragraph",
      },
      null,
    );

    session.applyOperation(secondOperation);

    expect(notifications).toBe(1);
  });

  it("notifies listeners when a snapshot is restored", () => {
    const session = new DocumentSession("client-a");

    let notifications = 0;

    session.subscribe(() => {
      notifications += 1;
    });

    const snapshot = session.serialize();

    session.restore(snapshot);

    expect(notifications).toBe(1);
  });
});