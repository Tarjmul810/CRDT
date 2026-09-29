import type { Operation } from "../crdt/type";
import type { LocalDocument, LocalStore } from "./local-store";

export class InMemoryLocalStore implements LocalStore {
    private readonly documents = new Map<string, LocalDocument>();

    private readonly pendingOperations =
        new Map<string, Operation[]>();

    private cloneDocument(
        document: LocalDocument
    ): LocalDocument {
        return {
            documentId: document.documentId,
            state: {
                elements: document.state.elements.map((element) => ({
                    ...element,
                    id: {
                        ...element.id,
                    },
                    after: element.after
                        ? { ...element.after }
                        : null,
                })),
                versionVector: {
                    ...document.state.versionVector,
                },
            },
        };
    }

    async saveDocument(
        document: LocalDocument
    ): Promise<void> {
        this.documents.set(
            document.documentId,
            this.cloneDocument(document)
        );
    }

    async loadDocument(
        documentId: string
    ): Promise<LocalDocument | null> {
        const document = this.documents.get(documentId);

        if (!document) {
            return null;
        }

        return this.cloneDocument(document);
    }

    async savePendingOperation(
        documentId: string,
        operation: Operation
    ): Promise<void> {
        const operations =
            this.pendingOperations.get(documentId) ?? [];

        operations.push(operation);

        this.pendingOperations.set(documentId, operations);
    }

    async removePendingOperation(
        documentId: string,
        operationId: {
            clientId: string;
            sequence: number;
        }
    ): Promise<void> {
        const operations =
            this.pendingOperations.get(documentId) ?? [];

        const filtered = operations.filter(
            (operation) =>
                !(
                    operation.id.clientId === operationId.clientId &&
                    operation.id.sequence === operationId.sequence
                )
        );

        this.pendingOperations.set(documentId, filtered);
    }

    async getPendingOperations(
        documentId: string
    ): Promise<Operation[]> {
        const operations =
            this.pendingOperations.get(documentId) ?? [];

        return [...operations];
    }
}