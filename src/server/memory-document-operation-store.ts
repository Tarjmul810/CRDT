import type { DocumentOperation } from "../document/operations";
import type { StoredDocumentOperation, DocumentOperationStore } from "./document-operation-store";

export class InMemoryDocumentOperationStore
    implements DocumentOperationStore {
    private operations = new Map<
        string,
        StoredDocumentOperation[]
    >();

    private versions = new Map<string, number>();

    private operationVersions = new Map<
        string,
        Map<string, StoredDocumentOperation>
    >();

    private getOperationId(operation: DocumentOperation) {
        if (
            operation.type === "insert_block" ||
            operation.type === "delete_block"
        ) {
            return operation.id;
        }

        return operation.operation.id;
    }

    async append(
        documentId: string,
        operation: DocumentOperation,
    ): Promise<StoredDocumentOperation> {
        let documentOperationVersions =
            this.operationVersions.get(documentId);

        if (!documentOperationVersions) {
            documentOperationVersions = new Map();
            this.operationVersions.set(
                documentId,
                documentOperationVersions,
            );
        }

        const operationId = this.getOperationId(operation);

        const operationKey = `${operationId.clientId}:${operationId.sequence}`;

        const existing =
            documentOperationVersions.get(operationKey!);

        if (existing) {
            return {
                ...existing,
                operation: {
                    ...existing.operation,
                },
            };
        }

        const nextVersion =
            (this.versions.get(documentId) ?? 0) + 1;

        const storedOperation: StoredDocumentOperation = {
            version: nextVersion,
            operation,
        };

        const operations =
            this.operations.get(documentId) ?? [];

        operations.push(storedOperation);

        this.operations.set(documentId, operations);
        this.versions.set(documentId, nextVersion);

        documentOperationVersions.set(
            operationKey!,
            storedOperation,
        );

        return {
            ...storedOperation,
            operation: {
                ...storedOperation.operation,
            },
        };
    }

    async getOperations(
        documentId: string,
        afterVersion = 0
    ): Promise<StoredDocumentOperation[]> {
        const operations =
            this.operations.get(documentId) ?? [];

        return operations
            .filter(
                (item) =>
                    item.version > afterVersion
            )
            .map((item) => ({
                version: item.version,
                operation: item.operation,
            }));
    }

    async getOperation(
        documentId: string,
        operationId: {
            clientId: string;
            sequence: number;
        },
    ): Promise<StoredDocumentOperation | null> {
        const documentOperationVersions =
            this.operationVersions.get(documentId);

        if (!documentOperationVersions) {
            return null;
        }

        const operationKey =
            `${operationId.clientId}:${operationId.sequence}`;

        return documentOperationVersions.get(operationKey) ?? null;
    }
}