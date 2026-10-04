import { RGA } from "../crdt/rga";
import type { ElementId, Operation } from "../crdt/type";
import type { Block } from "./types";
import type { RGAState } from "../crdt/rga";
import type {
    DeleteBlockOperation,
    DocumentOperation,
    InsertBlockOperation,
} from "./operations";

export class BlockList {
    private readonly rga: RGA;
    private readonly blockElements = new Map<string, ElementId>();
    private readonly elementBlocks = new Map<string, string>();

    constructor(clientId: string) {
        this.rga = new RGA(clientId);
    }

    private elementIdToString(id: ElementId): string {
        return `${id.clientId}:${id.sequence}`;
    }

    getBlockId(elementId: ElementId): string | undefined {
        return this.elementBlocks.get(
            this.elementIdToString(elementId)
        );
    }

    insertBlock(
        block: Block,
        after: ElementId | null
    ): InsertBlockOperation {
        const operation = this.rga.insert(
            JSON.stringify(block),
            after
        );

        this.blockElements.set(block.id, operation.id);

        this.elementBlocks.set(
            this.elementIdToString(operation.id),
            block.id
        );

        return {
            type: "insert_block",
            id: operation.id,
            block,
            after,
        };
    }

    deleteBlock(
        blockId: string
    ): DeleteBlockOperation {
        const elementId = this.blockElements.get(blockId) as any;
        const operation = this.rga.delete(elementId) as any

        if (blockId !== undefined) {
            this.blockElements.delete(blockId);
            this.elementBlocks.delete(
                this.elementIdToString(elementId)
            );
        }

        return {
            type: "delete_block",
            blockId: operation.target,
            id: operation.id,
        };
    }

    getElementId(blockId: string): ElementId | undefined {

        return this.blockElements.get(blockId);
    }

    applyDocumentOperation(
        operation: DocumentOperation
    ): void {
        if (operation.type === "insert_block") {
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

            this.blockElements.set(
                operation.block.id,
                operation.id
            );

            this.elementBlocks.set(
                this.elementIdToString(operation.id),
                operation.block.id
            );

            return;
        }

        if (operation.type === "delete_block") {
            const elementKey = this.blockElements.get(operation.blockId) as any;

            const blockId = operation.blockId

            this.rga.apply({
                type: "delete",
                id: elementKey!,
                target: elementKey!,
            });

            if (blockId !== undefined) {
                this.blockElements.delete(blockId);
                this.elementBlocks.delete(this.elementIdToString(elementKey!));
            }
            return;
        }
    }

    insert(
        block: Block,
        after: ElementId | null
    ): Operation {
        return this.rga.insert(JSON.stringify(block), after);
    }

    delete(blockId: ElementId) {
        return this.rga.delete(blockId);
    }

    applyOperation(operation: Operation): void {
        this.rga.apply(operation);
    }

    applyOperations(operations: Operation[]): void {
        for (const operation of operations) {
            this.applyOperation(operation);
        }
    }

    getBlocks(): Block[] {
        return this.rga.getElements().map(
            (element) => JSON.parse(element.value) as Block
        );
    }

    serialize(): RGAState {
        return this.rga.serialize();
    }

    restore(state: RGAState): void {
        this.rga.restore(state);
    }
}