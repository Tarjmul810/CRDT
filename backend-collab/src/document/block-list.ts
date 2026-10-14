import { RGA } from "../crdt/rga";
import type {
  ElementId,
  InsertOperation,
  DeleteOperation,
} from "../crdt/type";
import type { Block, BlockType } from "./types";
import type {
  DeleteBlockOperation,
  InsertBlockOperation,
  UpdateBlockOperation,
} from "./operations";

export type BlockTypeUpdate = {
  blockId: string;
  blockType: BlockType;
  operationId: ElementId;
  timestamp: number;
};

export type BlockListState = {
  rga: ReturnType<RGA["serialize"]>;
  typeUpdates: BlockTypeUpdate[];
};

export class BlockList {
  private readonly rga: RGA;
  private lamportClock = 0;

  private readonly blockElements =
    new Map<string, ElementId>();

  private readonly elementBlocks =
    new Map<string, string>();

  private readonly typeUpdates = new Map<string, BlockTypeUpdate>();

  constructor(clientId: string) {
    this.rga = new RGA(clientId);
  }


  private compareOperationIds(
    a: ElementId,
    b: ElementId,
  ): number {
    // Compare sequence first.
    if (a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }

    // Use clientId as a deterministic tie-breaker.
    return a.clientId < b.clientId
      ? -1
      : a.clientId > b.clientId
        ? 1
        : 0;
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
      | DeleteBlockOperation
      | UpdateBlockOperation,
  ): void {

    if (operation.type === "update_block") {
      this.applyBlockTypeUpdate(operation);
      return;
    }

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

  updateBlockType(
    blockId: string,
    blockType: BlockType,
  ): UpdateBlockOperation {
    const blockExists = this.getBlocks().some(
      (block) => block.id === blockId,
    );

    if (!blockExists) {
      throw new Error(`Block not found: ${blockId}`);
    }

    const operation: UpdateBlockOperation = {
      type: "update_block",
      id: this.rga.createOperationId(),
      blockId,
      blockType,
      timestamp: ++this.lamportClock,
    };

    this.applyDocumentOperation(operation);

    return operation;
  }


  private applyBlockTypeUpdate(
    operation: UpdateBlockOperation,
  ): void {
    // Observe the operation even if it loses conflict resolution.
    this.rga.observeOperationId(operation.id);

    this.lamportClock = Math.max(
      this.lamportClock,
      operation.timestamp,
    );

    const current = this.typeUpdates.get(operation.blockId);

    if (current) {
      const incomingWins =
        operation.timestamp > current.timestamp ||
        (
          operation.timestamp === current.timestamp &&
          operation.id.clientId > current.operationId.clientId
        );

      if (!incomingWins) {
        console.warn(
          "[BlockTypeUpdate] Rejected:",
          operation.blockId,
          {
            incomingTimestamp: operation.timestamp,
            currentTimestamp: current.timestamp,
          },
        );

        return;
      }
    }

    this.typeUpdates.set(operation.blockId, {
      blockId: operation.blockId,
      blockType: operation.blockType,
      operationId: { ...operation.id },
      timestamp: operation.timestamp,
    });
  }


  getBlocks(): Block[] {
    return this.rga
      .getElements()
      .filter((element) => !element.deleted)
      .map((element) => {
        const block = JSON.parse(element.value) as Block;
        const update = this.typeUpdates.get(block.id);

        return update
          ? { ...block, type: update.blockType }
          : block;
      });
  }

  serialize(): BlockListState {
    return {
      rga: this.rga.serialize(),
      typeUpdates: Array.from(this.typeUpdates.values()).map(
        (update) => ({
          ...update,
          operationId: { ...update.operationId },
        }),
      ),
    };
  }

  restore(state: BlockListState): void {
    this.rga.restore(state.rga);
    this.typeUpdates.clear();

    for (const update of state.typeUpdates ?? []) {
      this.typeUpdates.set(update.blockId, {
        ...update,
        operationId: { ...update.operationId },
      });
    }

    this.blockElements.clear();
    this.elementBlocks.clear();

    for (const element of this.rga.getElements()) {
      if (element.deleted) continue;

      const block = JSON.parse(element.value) as Block;

      this.blockElements.set(block.id, element.id);
      this.elementBlocks.set(
        this.elementIdToString(element.id),
        block.id,
      );

      this.lamportClock = Math.max(
        0,
        ...Array.from(
          this.typeUpdates.values(),
          (update) => update.timestamp,
        ),
      );
    }
  }
}