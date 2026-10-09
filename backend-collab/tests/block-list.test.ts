import {
  describe,
  expect,
  it,
} from "vitest";

import { BlockList } from "../src/document/block-list";
import type { DeleteBlockOperation, DeleteTextOperation, DocumentOperation, InsertTextOperation } from "../src/document/operations";

describe("BlockList", () => {
  it("inserts and returns blocks in order", () => {
    const blocks = new BlockList("client-a");

    const first = blocks.insertBlock(
      {
        id: "block-1",
        type: "heading",
      },
      null,
    );

    blocks.insertBlock(
      {
        id: "block-2",
        type: "paragraph",
      },
      first.id,
    );

    expect(blocks.getBlocks()).toEqual([
      {
        id: "block-1",
        type: "heading",
      },
      {
        id: "block-2",
        type: "paragraph",
      },
    ]);
  });

  it("deletes a block", () => {
    const blocks = new BlockList("client-a");

    const first = blocks.insertBlock(
      {
        id: "block-1",
        type: "paragraph",
      },
      null,
    );

    blocks.deleteBlock(first.blockId);

    expect(blocks.getBlocks()).toEqual([]);
  });

  it("applies remote operations", () => {
    const clientA = new BlockList("client-a");
    const clientB = new BlockList("client-b");

    const operation = clientA.insertBlock(
      {
        id: "block-1",
        type: "heading",
      },
      null,
    );

    clientB.applyDocumentOperation(operation);

    expect(clientB.getBlocks()).toEqual([
      {
        id: "block-1",
        type: "heading",
      },
    ]);
  });

  it("converges when two clients insert blocks concurrently", () => {
  const clientA = new BlockList("client-a");
  const clientB = new BlockList("client-b");

  const first = clientA.insertBlock(
    {
      id: "block-1",
      type: "paragraph",
    },
    null,
  );

  // Both clients know about the first block.
  clientB.applyDocumentOperation(first);

  const operationA = clientA.insertBlock(
    {
      id: "block-a",
      type: "paragraph",
    },
    first.id,
  );

  const operationB = clientB.insertBlock(
    {
      id: "block-b",
      type: "paragraph",
    },
    first.id,
  );

  // Deliver A's operation to B.
  clientB.applyDocumentOperation(operationA);

  // Deliver B's operation to A.
  clientA.applyDocumentOperation(operationB);

  expect(clientA.getBlocks()).toEqual(
    clientB.getBlocks(),
  );
});

it("creates an insert_block operation", () => {
  const blocks = new BlockList("client-a");

  const block = {
    id: "block-1",
    type: "paragraph" as const,
  };

  const operation = blocks.insertBlock(block, null);

  expect(operation.type).toBe("insert_block");
  expect(operation.block).toEqual(block);
  expect(operation.after).toBeNull();
  expect(operation.id.clientId).toBe("client-a");
  expect(operation.id.sequence).toBe(1);
});

it("creates a delete_block operation", () => {
  const blocks = new BlockList("client-a");

  const insert = blocks.insertBlock(
    {
      id: "block-1",
      type: "paragraph",
    },
    null
  );

  const operation = blocks.deleteBlock(insert.block.id);

  expect(operation?.type).toBe("delete_block");
  expect(operation?.id).toEqual(insert.id);
});

it("applies a remote insert_block operation", () => {
  const blocks = new BlockList("client-b");

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
    blockId: "block-1",
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
        value: "Hello",
        after: null,
        deleted: false,
      },
    },
    after: null,
  };

  blocks.applyDocumentOperation(operation);

  expect(blocks.getBlocks()).toEqual([
    {
      id: "block-1",
      type: "paragraph",
    },
  ]);
});

it("applies a remote delete_block operation", () => {
  const blocks = new BlockList("client-b");

  const insert = blocks.insertBlock(
    {
      id: "block-1",
      type: "paragraph",
    },
    null
  );

  const deleteOperation: DeleteBlockOperation = {
    type: "delete_block",
    blockId: insert.block.id,
    id: insert.id,
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
  };

  blocks.applyDocumentOperation(deleteOperation);

  expect(blocks.getBlocks()).toEqual([]);
});

it("maps a block id to its CRDT element id", () => {
  const blocks = new BlockList("client-a");

  const block = {
    id: "block-1",
    type: "paragraph" as const,
  };

  const operation = blocks.insertBlock(block, null);

  expect(blocks.getElementId("block-1")).toEqual(
    operation.id
  );
});

it("returns undefined for an unknown block", () => {
  const blocks = new BlockList("client-a");

  expect(blocks.getElementId("missing")).toBeUndefined();
});

it("maps a remotely inserted block to its element id", () => {
  const blocks = new BlockList("client-b");

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
    blockId: "block-1",
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
        value: "Hello",
        after: null,
        deleted: false,
      },
    },
    after: null,
  };

  blocks.applyDocumentOperation(operation);

  expect(blocks.getElementId("block-1")).toEqual(operation.id);
});

it("gets a block id from its element id", () => {
  const blocks = new BlockList("client-a");

  const operation = blocks.insertBlock(
    {
      id: "block-1",
      type: "paragraph",
    },
    null
  );

  expect(blocks.getBlockId(operation.id)).toBe("block-1");
});

it("removes block mappings after local deletion", () => {
  const blocks = new BlockList("client-a");

  const insert = blocks.insertBlock(
    {
      id: "block-1",
      type: "paragraph",
    },
    null
  );

  blocks.deleteBlock(insert.block.id);

  expect(
    blocks.getElementId("block-1")
  ).toBeUndefined();

  expect(
    blocks.getBlockId(insert.id)
  ).toBeUndefined();

  expect(blocks.getBlocks()).toEqual([]);
});

it("removes block mappings after remote deletion", () => {
  const blocks = new BlockList("client-b");

  const insert: DocumentOperation = {
    type: "insert_block",
    id: {
      clientId: "client-a",
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
        clientId: "client-a",
        sequence: 1,
      },
      element: {
        id: {
          clientId: "client-a",
          sequence: 1,
        },
        value: "Hello",
        after: null,
        deleted: false,
      },
    },
    after: null,
  };

  blocks.applyDocumentOperation(insert);

  const deletion: DeleteBlockOperation = {
    type: "delete_block",
    blockId: insert.block.id,
    id: insert.id,
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
  };

  blocks.applyDocumentOperation(deletion);

  expect(
    blocks.getElementId("block-1")
  ).toBeUndefined();

  expect(
    blocks.getBlockId(insert.id)
  ).toBeUndefined();

  expect(blocks.getBlocks()).toEqual([]);
});

it("accepts an insert_text operation", () => {
  const operation: InsertTextOperation = {
    type: "insert_text",
    blockId: "block-1",
    operation: { type: "insert", id: { clientId: "client-a", sequence: 1 }, element: { id: { clientId: "client-a", sequence: 1 }, value: "H", after: null, deleted: false } },
    id: { clientId: "client-a", sequence: 1 },
   
  };

  expect(operation.type).toBe("insert_text");
  expect(operation.blockId).toBe("block-1");
});

it("accepts a delete_text operation", () => {
  const operation: DeleteTextOperation = {
    type: "delete_text",
    blockId: "block-1",
    operation: {
      type: "delete",
      id: {
        clientId: "client-a",
        sequence: 2,
      },
      target: {
        clientId: "client-a",
        sequence: 1,
      },
    },
    id: { clientId: "client-a", sequence: 1 },
  };

  expect(operation.type).toBe("delete_text");
  expect(operation.blockId).toBe("block-1");
});

});