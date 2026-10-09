import { BlockList } from "./block-list";
import { BlockContent } from "./block-content";

import type {
  BlockId,
  Block,
} from "./types";

import type {
  DocumentOperation,
  InsertTextOperation,
  DeleteTextOperation,
  InsertBlockOperation,
} from "./operations";

import type {
  Element as CRDTElement,
  ElementId,
  InsertOperation,
  DeleteOperation,
} from "../crdt/type";

import type {
  DocumentStateSnapshot,
} from "./document-state-snapshot";

export class DocumentState {
  readonly blocks: BlockList;

  private operationSequence = 0;

  private readonly contents =
    new Map<BlockId, BlockContent>();

  /**
   * Document operations whose target block does
   * not exist yet.
   *
   * Example:
   *
   * insert_text(block-1)
   *
   * arrives before:
   *
   * insert_block(block-1)
   */
  private readonly pendingOperations: DocumentOperation[] =
    [];

  constructor(
    private readonly clientId: string,
  ) {
    this.blocks = new BlockList(clientId);
  }

  createContent(
    blockId: BlockId,
  ): BlockContent {
    const existing =
      this.contents.get(blockId);

    if (existing) {
      console.log("Block already exists", blockId);
      return existing;
    }

    const content = new BlockContent(
      `${this.clientId}`,
    );

    console.log("Creating block content", blockId);

    this.contents.set(
      blockId,
      content,
    );

    return content;
  }

  getContent(
    blockId: BlockId,
  ): BlockContent | undefined {
    return this.contents.get(blockId);
  }

  insertBlock(
    block: Block,
    after: ElementId | null,
  ): InsertBlockOperation {
    const operation =
      this.blocks.insertBlock(
        block,
        after,
      )

    this.createContent(block.id);

    return {
      type: "insert_block",

      // Document-level operation ID.
      id: operation.id,

      blockId: block.id,
      block,
      after,

      // Actual block RGA operation.
      operation: operation.operation,
    };
  }

  deleteBlock(
    blockId: string,
  ): DocumentOperation {
    const operation =
      this.blocks.deleteBlock(blockId);

    if (!operation) {
      throw new Error(
        `Block not found: ${blockId}`,
      );
    }

    this.contents.delete(blockId);

    return {
      type: "delete_block",

      // Document-level operation ID.
      id: operation.id,

      blockId,

      // Exact block RGA delete operation.
      operation: operation.operation,
    };
  }

  applyDocumentOperation(
    operation: DocumentOperation,
  ): void {
    if (
      operation.type ===
      "insert_block"
    ) {
      this.blocks.applyDocumentOperation(
        operation,
      );

      this.createContent(
        operation.blockId,
      )

      console.log("Insert block", operation);

      this.flushPendingOperations();
      return;
    }

    if (
      operation.type ===
      "delete_block"
    ) {
      this.blocks.applyDocumentOperation(
        operation,
      );

      this.contents.delete(
        operation.blockId,
      );

      return;
    }

    if (
      operation.type ===
      "insert_text"
    ) {
      const content =
        this.contents.get(
          operation.blockId,
        );

         console.log("TEXT CONTENT", {
    blockId: operation.blockId,
    exists: !!content,
    before: content?.getText(),
    operation: operation.operation,
  });

      if (!content) {
        this.pendingOperations.push(
          operation,
        );

        console.log("insertText", operation);

        return;
      }

      content.applyOperation(
        operation.operation,
      );

      console.log(
    "AFTER TEXT",
    content.getText(),
  );

      return;
    }

    if (
      operation.type ===
      "delete_text"
    ) {
      const content =
        this.contents.get(
          operation.blockId,
        );

      if (!content) {
        this.pendingOperations.push(
          operation,
        );

        return;
      }

      content.applyOperation(
        operation.operation,
      );

      return;
    }
  }

  private flushPendingOperations(): void {
    let changed = true;

    while (
      changed &&
      this.pendingOperations.length > 0
    ) {
      changed = false;

      const remaining: DocumentOperation[] =
        [];

      for (
        const operation of this.pendingOperations
      ) {
        if (
          operation.type ===
            "insert_text" ||
          operation.type ===
            "delete_text"
        ) {
          const content =
            this.contents.get(
              operation.blockId,
            );

          if (!content) {
            console.log("content in flush ", operation);
            remaining.push(operation);
            continue;
          }

          content.applyOperation(
            operation.operation,
          );

          changed = true;
          continue;
        }

        remaining.push(operation);
      }

      this.pendingOperations.length = 0;

      this.pendingOperations.push(
        ...remaining,
      );
    }
  }

  insertText(
    blockId: BlockId,
    value: string,
    after: ElementId | null,
  ): InsertTextOperation {
    const content =
      this.contents.get(blockId);

    if (!content) {
      throw new Error(
        `Block not found: ${blockId}`,
      );
    }

    const operation =
      content.insert(
        value,
        after,
      ) as InsertOperation;

    return {
      type: "insert_text",
      blockId,

      // Document-level operation ID.
      id: operation.id,

      // Actual text RGA operation.
      operation,
    };
  }

  deleteText(
    blockId: BlockId,
    target: ElementId,
  ): DeleteTextOperation {
    const content =
      this.contents.get(blockId);

    if (!content) {
      throw new Error(
        `Block not found: ${blockId}`,
      );
    }

    const operation =
      content.delete(
        target,
      ) as DeleteOperation;

    return {
      type: "delete_text",
      blockId,

      // Document-level operation ID.
      id: operation.id,

      // Actual text RGA operation.
      operation,
    };
  }

  serialize(): DocumentStateSnapshot {
    return {
      blockList:
        this.blocks.serialize(),

      contents:
        Array.from(
          this.contents.entries(),
        ).map(
          ([blockId, content]) => ({
            blockId,
            state:
              content.serialize(),
          }),
        ),
    };
  }

  restore(
    snapshot: DocumentStateSnapshot,
  ): void {
    this.blocks.restore(
      snapshot.blockList,
    );

    this.contents.clear();

    for (
      const contentSnapshot of
        snapshot.contents
    ) {
      const content =
        this.createContent(
          contentSnapshot.blockId,
        );

      content.restore(
        contentSnapshot.state,
      );
    }

    this.pendingOperations.length = 0;
  }

  getText(
    blockId: string,
  ): string {
    const content =
      this.contents.get(blockId);

    if (!content) {
      throw new Error(
        `Block not found: ${blockId}`,
      );
    }

    return content.getText();
  }

  getBlocks(): Block[] {
    return this.blocks.getBlocks();
  }

  getTextElements(
    blockId: string,
  ): CRDTElement[] {
    const content =
      this.contents.get(blockId);

    if (!content) {
      throw new Error(
        `Block not found: ${blockId}`,
      );
    }

    return content.getElements();
  }
}