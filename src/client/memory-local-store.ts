import type { ElementId, Operation } from "../crdt/type";
import type { DocumentOperation } from "../document/operations";
import type { LocalDocument, LocalStore } from "./local-store";

export class InMemoryLocalStore implements LocalStore {
    private readonly documents = new Map<string, LocalDocument>();

    private readonly pendingOperations =
        new Map<string, DocumentOperation[]>();

    private cloneDocument(
        document: LocalDocument
    ): LocalDocument {

        return {
            documentId: document.documentId,

            state: {
                blockList: {
                    elements: document.state.blockList.elements.map(
                        (element) => ({
                            ...element,

                            id: {
                                ...element.id,
                            },

                            after: element.after
                                ? {
                                    ...element.after,
                                }
                                : null,
                        })
                    ),

                    versionVector: {
                        ...document.state.blockList.versionVector,
                    },
                },

                contents: document.state.contents.map(
                    (content) => ({
                        blockId: content.blockId,

                        state: {
                            elements: content.state.elements.map(
                                (element) => ({
                                    ...element,

                                    id: {
                                        ...element.id,
                                    },

                                    after: element.after
                                        ? {
                                            ...element.after,
                                        }
                                        : null,
                                })
                            ),

                            versionVector: {
                                ...content.state.versionVector,
                            },
                        },
                    })
                ),
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
        operation: DocumentOperation
    ): Promise<void> {
        const operations =
            this.pendingOperations.get(documentId) ?? [];

        operations.push(operation);

        this.pendingOperations.set(documentId, operations);
    }

    async removePendingOperation(
        documentId: string,
        operationId: ElementId,
    ): Promise<void> {
        const operations = this.pendingOperations.get(documentId) ?? [];

        console.log("operations", operations)

        const filtered = operations.filter((operation) => {
            const id =
                operation.type === "insert_block" ||
                    operation.type === "delete_block"
                    ? operation.id
                    : operation.operation.id;



            return !(
                id.clientId === operationId.clientId &&
                id.sequence === operationId.sequence
            );
        });

        this.pendingOperations.set(documentId, filtered);
    }

    async getPendingOperations(
        documentId: string
    ): Promise<DocumentOperation[]> {
        const operations =
            this.pendingOperations.get(documentId) ?? [];

        return structuredClone(operations);
    }
}