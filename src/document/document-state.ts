import { BlockList } from "./block-list";
import { BlockContent } from "./block-content";
import type { BlockId, Block } from "./types";
import type { DocumentOperation, InsertTextOperation, DeleteTextOperation } from "./operations";
import type { ElementId, InsertOperation, DeleteOperation } from "../crdt/type";
import type { DocumentStateSnapshot } from "./document-state-snapshot";

export class DocumentState {
  readonly blocks: BlockList;

  private readonly contents =
    new Map<BlockId, BlockContent>();

  constructor(
    private readonly clientId: string
  ) {
    this.blocks = new BlockList(clientId);
  }

  createContent(blockId: BlockId): BlockContent {
    const existing = this.contents.get(blockId);

    if (existing) {
      return existing;
    }

    const content = new BlockContent(
      `${this.clientId}:${blockId}`
    );

    this.contents.set(blockId, content);

    return content;
  }

  getContent(
    blockId: BlockId
  ): BlockContent | undefined {
    return this.contents.get(blockId);
  }

  insertBlock(
    block: Block,
    after: ElementId | null
  ): DocumentOperation {
    const operation = this.blocks.insertBlock(
      block,
      after
    );

    this.createContent(block.id)

    return operation;
  }

  deleteBlock(
    blockId: string
  ): DocumentOperation {
    const elementId = this.blocks.getElementId(blockId);

    if (!elementId) {
      throw new Error(`Block not found: ${blockId}`);
    }

    const operation = this.blocks.deleteBlock(blockId);
    this.contents.delete(blockId);
    return operation;
  }

  applyDocumentOperation(
    operation: DocumentOperation
  ): void {
    if (operation.type === "insert_block") {
      this.blocks.applyDocumentOperation(operation);
      this.createContent(operation.block.id);
      return;
    }

    if (operation.type === "delete_block") {
      this.blocks.applyDocumentOperation(operation);
      if (operation.blockId !== undefined) {
        this.contents.delete(operation.blockId);
      }
      return;
    }

    if (operation.type === "insert_text") {
      const content = this.contents.get(operation.blockId);

      if (!content) {
        throw new Error(
          `Block not found: ${operation.blockId}`
        );
      }

      content.applyOperation(operation.operation);
      return;
    }

    if (operation.type === "delete_text") {
      const content = this.contents.get(operation.blockId);

      if (!content) {
        throw new Error(
          `Block not found: ${operation.blockId}`
        );
      }

      content.applyOperation(operation.operation);
      return;
    }
  }

  insertText(
    blockId: BlockId,
    value: string,
    after: ElementId | null
  ): InsertTextOperation {
    const content = this.contents.get(blockId);

    if (!content) {
      throw new Error(`Block not found: ${blockId}`);
    }

    const operation = content.insert(value, after) as InsertOperation;

    return {
      type: "insert_text",
      blockId,
      operation,
    };
  }

  deleteText(
    blockId: BlockId,
    target: ElementId
  ): DeleteTextOperation {
    const content = this.contents.get(blockId);

    if (!content) {
      throw new Error(`Block not found: ${blockId}`);
    }

    const operation = content.delete(target) as DeleteOperation;

    return {
      type: "delete_text",
      blockId,
      operation,
    };
  }

  serialize(): DocumentStateSnapshot {
  return {
    blockList: this.blocks.serialize(),
    contents: Array.from(this.contents.entries()).map(
      ([blockId, content]) => ({
        blockId,
        state: content.serialize(),
      })
    ),
  };
}

restore(snapshot: DocumentStateSnapshot): void {
  this.blocks.restore(snapshot.blockList);

  this.contents.clear();

  for (const contentSnapshot of snapshot.contents) {
    const content = this.createContent(
      contentSnapshot.blockId
    );

    content.restore(contentSnapshot.state);
  }
}
}