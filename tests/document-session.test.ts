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