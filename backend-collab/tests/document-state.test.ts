import {
  describe,
  expect,
  it,
} from "vitest";

import { DocumentState } from "../src/document/document-state";
import type { DocumentOperation } from "../src/document/operations";
import type { Block } from "../src/document/types";
import type { InsertOperation } from "../src/crdt/type";

describe("DocumentState", () => {
  it("creates content state for a block", () => {
    const document = new DocumentState(
      "client-a"
    );

    const content =
      document.createContent("block-1");

    content.insert("H", null);

    expect(
      document
        .getContent("block-1")
        ?.getText()
    ).toBe("H");
  });

  it("returns the same content state for the same block", () => {
    const document = new DocumentState(
      "client-a"
    );

    const first =
      document.createContent("block-1");

    const second =
      document.createContent("block-1");

    expect(first).toBe(second);
  });

  it("keeps content state isolated between blocks", () => {
    const document = new DocumentState(
      "client-a"
    );

    const first =
      document.createContent("block-1");

    const second =
      document.createContent("block-2");

    first.insert("A", null);
    second.insert("B", null);

    expect(first.getText()).toBe("A");
    expect(second.getText()).toBe("B");
  });

  it("uses a stable client identity for block content", () => {
  const document = new DocumentState(
    "client-a"
  );

  const content =
    document.createContent("block-1");

  const operation = content.insert(
    "H",
    null
  );

  expect(operation.id.clientId).toBe(
    "client-a"
  );
});

it("inserts a block through the document state", () => {
  const document = new DocumentState("client-a");

  const block: Block = {
    id: "block-1",
    type: "paragraph",
  };

  const operation = document.insertBlock(block, null);

  expect(operation.type).toBe("insert_block");
  expect(document.blocks.getBlocks()).toEqual([
    block,
  ]);
});

it("deletes a block through the document state", () => {
  const document = new DocumentState("client-a");

  const block: Block = {
    id: "block-1",
    type: "paragraph",
  };

  document.insertBlock(block, null);

  const operation = document.deleteBlock(block.id);

  expect(operation.type).toBe("delete_block");
  expect(document.blocks.getBlocks()).toEqual([]);
});

it("removes content state when deleting a block", () => {
  const document = new DocumentState("client-a");

  const block: Block = {
    id: "block-1",
    type: "paragraph",
  };

  document.insertBlock(block, null);

  expect(document.getContent(block.id)).toBeDefined();

  document.deleteBlock(block.id);

  expect(document.getContent(block.id)).toBeUndefined();
});

it("throws when deleting an unknown block", () => {
  const document = new DocumentState("client-a");

  expect(() => {
    document.deleteBlock("missing-block");
  }).toThrow("Block not found: missing-block");
});

it("applies a remote block insertion", () => {
  const document = new DocumentState("client-b");

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
    blockId: `block-1`,
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
        value: "H",
        after: null,
        deleted: false,
      },
    },
    after: null,
  };

  document.applyDocumentOperation(operation);

  expect(document.blocks.getBlocks()).toEqual([
    {
      id: "block-1",
      type: "paragraph",
    },
  ]);

  expect(
    document.getContent("block-1")
  ).toBeDefined();
});

it("inserts text into a block", () => {
  const document = new DocumentState("client-a");

  document.insertBlock(
    {
      id: "block-1",
      type: "paragraph",
    },
    null
  );

  const operation = document.insertText(
    "block-1",
    "H",
    null
  );

  expect(operation.type).toBe("insert_text");
  expect(operation.blockId).toBe("block-1");
  expect(operation.operation.type).toBe("insert");

  expect(
    document.getContent("block-1")?.getText()
  ).toBe("H");
});

it("deletes text from a block", () => {
  const document = new DocumentState("client-a");

  document.insertBlock(
    {
      id: "block-1",
      type: "paragraph",
    },
    null
  );

  const insert = document.insertText(
    "block-1",
    "H",
    null
  );

  document.insertText(
    "block-1",
    "i",
    insert.operation.id
  );

  const operation = document.deleteText(
    "block-1",
    insert.operation.id
  );

  expect(operation.type).toBe("delete_text");
  expect(operation.blockId).toBe("block-1");

  expect(
    document.getContent("block-1")?.getText()
  ).toBe("i");
});

it("throws when inserting text into an unknown block", () => {
  const document = new DocumentState("client-a");

  expect(() => {
    document.insertText(
      "missing-block",
      "H",
      null
    );
  }).toThrow("Block not found: missing-block");
});

it("throws when deleting text from an unknown block", () => {
  const document = new DocumentState("client-a");

  expect(() => {
    document.deleteText(
      "missing-block",
      {
        clientId: "client-a",
        sequence: 1,
      }
    );
  }).toThrow("Block not found: missing-block");
});

it("applies a remote text insertion", () => {
  const document = new DocumentState("client-b");

  document.applyDocumentOperation({
    type: "insert_block",
    id: {
      clientId: "client-a",
      sequence: 1,
    },
    block: {
      id: "block-1",
      type: "paragraph",
    },
    blockId: `block-1`,
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
        value: "H",
        after: null,
        deleted: false,
      },
    },
    after: null,
  });

  document.applyDocumentOperation({
    type: "insert_text",
    id: {
      clientId: "client-a",
      sequence: 2,
    },
    blockId: "block-1",
    operation: {
      type: "insert",
      id: {
        clientId: "client-a",
        sequence: 2,
      },
      element: {
        id: {
          clientId: "client-a",
          sequence: 2,
        },
        value: "H",
        after: null,
        deleted: false,
      },
    },
  });

  expect(
    document.getContent("block-1")?.getText()
  ).toBe("H");
});

it("applies a remote text deletion", () => {
  const document = new DocumentState("client-b");

  document.applyDocumentOperation({
    type: "insert_block",
    id: {
      clientId: "client-a",
      sequence: 1,
    },
    block: {
      id: "block-1",
      type: "paragraph",
    },
    blockId: `block-1`,
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
        value: "H",
        after: null,
        deleted: false,
      },
    },
    after: null,
  });

  const insert: InsertOperation = {
    type: "insert",
    id: {
      clientId: "client-a",
      sequence: 2,
    },
    element: {
      id: {
        clientId: "client-a",
        sequence: 2,
      },
      value: "H",
      after: null,
      deleted: false,
    },
  };

  document.applyDocumentOperation({
    type: "insert_text",
    id: {
      clientId: "client-a",
      sequence: 2,
    },
    blockId: "block-1",
    operation: insert,
  });

  document.applyDocumentOperation({
    type: "delete_text",
    id: {
      clientId: "client-a",
      sequence: 3,
    },
    blockId: "block-1",
    operation: {
      type: "delete",
      id: {
        clientId: "client-a",
        sequence: 3,
      },
      target: insert.id,
    },
  });

  expect(
    document.getContent("block-1")?.getText()
  ).toBe("");
});

it("serializes and restores the complete document state", () => {
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
    "H",
    null
  );

  document.insertText(
    "block-1",
    "i",
    {
      clientId: "client-a:block-1",
      sequence: 1,
    }
  );

  const snapshot = document.serialize();

  const restored = new DocumentState("client-a");

  restored.restore(snapshot);

  expect(restored.blocks.getBlocks()).toEqual([
    {
      id: "block-1",
      type: "paragraph",
    },
  ]);

  expect(
    restored.getContent("block-1")?.getText()
  ).toBe("Hi");
});

it("restores content for multiple blocks independently", () => {
  const document = new DocumentState("client-a");

  document.insertBlock(
    {
      id: "block-1",
      type: "paragraph",
    },
    null
  );

  document.insertBlock(
    {
      id: "block-2",
      type: "heading",
    },
    null
  );

  document.insertText("block-1", "A", null);
  document.insertText("block-2", "B", null);

  const snapshot = document.serialize();

  const restored = new DocumentState("client-a");

  restored.restore(snapshot);

  expect(
    restored.getContent("block-1")?.getText()
  ).toBe("A");

  expect(
    restored.getContent("block-2")?.getText()
  ).toBe("B");
});

it("applies a sequence of mixed document operations", () => {
  const document = new DocumentState("client-b");

  const insertBlock: DocumentOperation = {
    type: "insert_block",
    id: {
      clientId: "client-a",
      sequence: 1,
    },
    block: {
      id: "block-1",
      type: "paragraph",
    },
    blockId: `block-1`,
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
        value: "H",
        after: null,
        deleted: false,
      },
    },
    after: null,
  };

  const insertText: DocumentOperation = {
    type: "insert_text",
    id: {
      clientId: "client-a",
      sequence: 2,
    },
    blockId: "block-1",
    operation: {
      type: "insert",
      id: {
        clientId: "client-a",
        sequence: 2,
      },
      element: {
        id: {
          clientId: "client-a",
          sequence: 2,
        },
        value: "Hello",
        after: null,
        deleted: false,
      },
    },
  };

  document.applyDocumentOperation(insertBlock);
  document.applyDocumentOperation(insertText);

  expect(document.blocks.getBlocks()).toEqual([
    {
      id: "block-1",
      type: "paragraph",
    },
  ]);

  expect(
    document.getContent("block-1")?.getText()
  ).toBe("Hello");
});

it("applies block creation, text insertion, text deletion, and block deletion", () => {
  const document = new DocumentState("client-b");

  const elementId = {
    clientId: "client-a",
    sequence: 1,
  };

  const blockId = "block-1";

  document.applyDocumentOperation({
    type: "insert_block",
    id: elementId,
    block: {
      id: "block-1",
      type: "paragraph",
    },
    blockId: `block-1`,
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
        value: "H",
        after: null,
        deleted: false,
      },
    },
    after: null,
  });

  const textId = {
    clientId: "client-a",
    sequence: 2,
  };

  document.applyDocumentOperation({
    type: "insert_text",
    id: {
      clientId: "client-a",
      sequence: 2,
    },
    blockId: "block-1",
    operation: {
      type: "insert",
      id: textId,
      element: {
        id: textId,
        value: "Hello",
        after: null,
        deleted: false,
      },
    },
  });

  document.applyDocumentOperation({
    type: "delete_text",
    id: {
      clientId: "client-a",
      sequence: 3,
    },
    blockId: "block-1",
    operation: {
      type: "delete",
      id: {
        clientId: "client-a",
        sequence: 3,
      },
      target: textId,
    },
  });

  expect(
    document.getContent("block-1")?.getText()
  ).toBe("");

  document.applyDocumentOperation({
    type: "delete_block",
    blockId,
    id: elementId,
    operation: {
      type: "delete",
      id: {
        clientId: "client-a",
        sequence: 1,
      },
      target: {
        clientId: "client-a",
        sequence: 1,
      },
    },
  });

  expect(document.blocks.getBlocks()).toEqual([]);
  expect(document.getContent("block-1")).toBeUndefined();
});

});