import { describe, expect, it } from "vitest";
import type { DocumentMessage } from "../src/document/protocol";

it("represents a document operation message", () => {
  const message: DocumentMessage = {
    type: "document_operation",
    operation: {
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
    },
  };

  expect(message.type).toBe("document_operation");
  expect(message.operation.type).toBe("insert_block");
});

it("represents a document sync message", () => {
  const message: DocumentMessage = {
    type: "document_sync",
    operations: [],
  };

  expect(message.type).toBe("document_sync");
  expect(message.operations).toEqual([]);
});