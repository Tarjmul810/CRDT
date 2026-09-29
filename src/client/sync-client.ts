import type { WebSocket } from "ws";
import type { ElementId, Operation, DeleteOperation } from "../crdt/type";
import type { LocalStore, LocalDocument } from "./local-store";
import { SyncState } from "./sync-state";

export class SyncClient {
    private socket: WebSocket;
    constructor(
        socket: WebSocket,
        private readonly state: SyncState,
        private readonly localStore: LocalStore,
        private readonly documentId: string,
    ) {
        this.socket = socket;
        this.attachSocket(socket);

    }

    private attachSocket(socket: WebSocket): void {
        if (typeof socket.on !== "function") {
            return;
        }
        socket.on("message", (data) => {
            try {
                const message = JSON.parse(
                    data.toString(),
                );

                this.handleMessage(message);
            } catch {
                // Ignore malformed messages for now.
            }
        });
    }

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

    private async acknowledgeOperation(
        operationId: { clientId: string; sequence: number },
    ): Promise<void> {

        this.state.acknowledgeOperation(operationId);

        const index = this.pendingOperations.findIndex(
            (operation) =>
                operation.id.clientId === operationId.clientId &&
                operation.id.sequence === operationId.sequence,
        );

        if (index !== -1) {
            this.pendingOperations.splice(index, 1);
        }

        await this.localStore.removePendingOperation(
            this.documentId,
            operationId,
        );
    }

    async restorePendingOperations(): Promise<void> {
        const operations =
            await this.localStore.getPendingOperations(
                this.documentId
            );

        this.pendingOperations.length = 0;

        this.pendingOperations.push(...operations);
    }

    async saveDocumentState(): Promise<void> {
        await this.localStore.saveDocument({
            documentId: this.documentId,
            state: this.state.serialize(),
        });
    }

    async restoreDocumentState(): Promise<void> {
        const document =
            await this.localStore.loadDocument(this.documentId);

        if (!document) {
            return;
        }

        this.state.restore(document.state);
    }

    requestSync(): void {
        this.socket.send(
            JSON.stringify({
                type: "sync",
                versionVector: this.state.getAcknowledgedVersionVector(),
            }),
        );
    }

    async reconnected(): Promise<void> {
        await this.restorePendingOperations();
        this.requestSync();
        this.flush();
    }

    replaceSocket(socket: WebSocket): void {
        this.socket = socket;
        this.attachSocket(socket);
    }

    async handleMessage(message: any): Promise<void> {
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

            this.state.acknowledgeOperation(operation.id);

            await this.saveDocumentState()
            return;
        }

        if (msg.type === "sync") {
            const operations = msg.operations as Operation[];

            this.state.applyOperations(operations);

            this.state.acknowledgeOperations(operations);
            await this.saveDocumentState()
            return;
        }

        if (msg.type === "operation_ack") {
            const operationId = msg.operationId;

            await this.acknowledgeOperation(
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

        this.localStore.savePendingOperation(
            this.documentId,
            operation,
        );

        this.localStore.saveDocument({
            documentId: this.documentId,
            state: this.state.serialize(),
        }
        );

        this.flush()

        return operation;
    }

    delete(target: ElementId) {
        const operation = this.state.delete(target) as DeleteOperation;

        this.pendingOperations.push(operation);

        this.localStore.savePendingOperation(
            this.documentId,
            operation,
        );

        this.localStore.saveDocument({
            documentId: this.documentId,
            state: this.state.serialize(),
        }
        );

        this.flush()

        return operation;
    }

    getText(): string {
        return this.state.getText();
    }

    getVersionVector(): Record<string, number> {
        return this.state.getVersionVector();
    }

    getPendingOperationCount(): number {
        return this.pendingOperations.length;
    }
}