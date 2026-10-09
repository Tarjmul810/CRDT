import { RGA } from "../crdt/rga";
import type {
  ElementId,
  InsertOperation,
  DeleteOperation,
} from "../crdt/type";
import type { Block } from "./types";
import type {
  DeleteBlockOperation,
  InsertBlockOperation,
} from "./operations";

export class BlockList {
  private readonly rga: RGA;

  private readonly blockElements =
    new Map<string, ElementId>();

  private readonly elementBlocks =
    new Map<string, string>();

  constructor(clientId: string) {
    this.rga = new RGA(clientId);
  }

  private elementIdToString(
    id: ElementId,
  ): string {
    return `${id.clientId}:${id.sequence}`;
  }

  getBlockId(
    elementId: ElementId,
  ): string | undefined {
    return this.elementBlocks.get(
      this.elementIdToString(elementId),
    );
  }

  getElementId(
    blockId: string,
  ): ElementId | undefined {
    return this.blockElements.get(blockId);
  }

  insertBlock(
    block: Block,
    after: ElementId | null,
  ): InsertBlockOperation {
    const operation = this.rga.insert(
      JSON.stringify(block),
      after,
    );

    this.blockElements.set(
      block.id,
      operation.id,
    );

    this.elementBlocks.set(
      this.elementIdToString(operation.id),
      block.id,
    );

    return {
      type: "insert_block",
      id: operation.id,
      blockId: block.id,
      block,
      after,
      operation,
    };
  }

  deleteBlock(
    blockId: string,
  ): DeleteBlockOperation | undefined {
    const elementId =
      this.blockElements.get(blockId);

    if (!elementId) {
      return undefined;
    }

    const operation =
      this.rga.delete(elementId);

    if (!operation) {
      return undefined;
    }

    this.blockElements.delete(blockId);

    this.elementBlocks.delete(
      this.elementIdToString(elementId),
    );

    return {
      type: "delete_block",
      id: operation.id,
      blockId,
      operation,
    };
  }

  applyDocumentOperation(
    operation:
      | InsertBlockOperation
      | DeleteBlockOperation,
  ): void {
    if (operation.type === "insert_block") {
      // Apply the exact RGA operation received
      // from the remote replica.

      this.rga.apply({
        type: "insert",
        id: operation.id,
        element: {
          id: operation.id,
          value: JSON.stringify(operation.block),
          after: operation.after,
          deleted: false,
        },
      });

      // Use the block metadata from the
      // document operation itself.
      this.blockElements.set(
        operation.blockId,
        operation.operation.id,
      );

      this.elementBlocks.set(
        this.elementIdToString(
          operation.operation.id,
        ),
        operation.blockId,
      );

      return;
    }

    // delete_block

    // Apply the exact RGA delete operation.
    const elementId = this.blockElements.get(operation.blockId);

    this.rga.apply({
      type: "delete",
      id: elementId!,
      target: elementId!,
    });

    this.blockElements.delete(
      operation.blockId,
    );

    this.elementBlocks.delete(
      this.elementIdToString(elementId!),
    );
  }

  getBlocks(): Block[] {
    const blocks = this.rga
      .getElements()
      .filter(
        (element) => !element.deleted,
      )
      .map((element) => {
        return JSON.parse(
          element.value,
        ) as Block;
      });

    return blocks;
  }

  serialize() {
    return this.rga.serialize();
  }

  restore(
    state: ReturnType<RGA["serialize"]>,
  ): void {
    this.rga.restore(state);

    this.blockElements.clear();
    this.elementBlocks.clear();

    for (
      const element of this.rga.getElements()
    ) {
      if (element.deleted) {
        continue;
      }

      const block = JSON.parse(
        element.value,
      ) as Block;

      this.blockElements.set(
        block.id,
        element.id,
      );

      this.elementBlocks.set(
        this.elementIdToString(element.id),
        block.id,
      );
    }
  }
}