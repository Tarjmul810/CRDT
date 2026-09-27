import type { WebSocket } from "ws";
import type { ElementId, Operation, DeleteOperation } from "../crdt/type";
import { SyncState } from "./sync-state";

export class SyncClient {
    constructor(
        private readonly socket: WebSocket,
        private readonly state: SyncState,
    ) { }

    private readonly pendingOperations: Operation[] = [];

    private flush(): void {
        if (this.socket.readyState !== 1) {
            return;
        }

        for (const operation of this.pendingOperations) {
            this.socket.send(
                JSON.stringify({
                    type: "operation",
                    operation,
                }),
            );
        }
    }

    private acknowledgeOperation(
        operationId: { clientId: string; sequence: number },
    ): void {
        const index = this.pendingOperations.findIndex(
            (operation) =>
                operation.id.clientId === operationId.clientId &&
                operation.id.sequence === operationId.sequence,
        );

        if (index !== -1) {
            this.pendingOperations.splice(index, 1);
        }
    }


    requestSync(): void {
        this.socket.send(
            JSON.stringify({
                type: "sync",
                versionVector: this.state.getVersionVector(),
            }),
        );
    }

    reconnected(): void {
        this.requestSync();
        this.flush();
    }

    handleMessage(message: any): void {
        const operationId = message?.operationId;
        if (
            typeof message !== "object" ||
            message === null
        ) {
            return;
        }

        const msg = message as Record<string, unknown>;

        if (msg.type === "operation") {
            const operation = msg.operation as Operation;

            this.state.applyOperation(operation);
            return;
        }

        if (msg.type === "sync") {
            const operations = msg.operations as Operation[];

            this.state.applyOperations(operations);
        }

        if (msg.type === "operation_ack") {
            const operationId = msg.operationId;

                this.acknowledgeOperation(
                    operationId as {
                        clientId: string;
                        sequence: number;
                    },
                );
            return;
        }
    }

    insert(
        value: string,
        after: ElementId | null,
    ): Operation {
        const operation = this.state.insert(value, after);

        this.pendingOperations.push(operation);

        this.flush()

        return operation;
    }

    delete(target: ElementId) {
        const operation = this.state.delete(target) as DeleteOperation;

        this.pendingOperations.push(operation);

        this.flush()

        return operation;
    }

    getText(): string {
        return this.state.getText();
    }

    getVersionVector(): Record<string, number> {
        return this.state.getVersionVector();
    }
}