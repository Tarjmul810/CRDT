import type { Operation } from "../crdt/type";
import type { OperationStore, StoredOperation } from "./operation-store";

export class InMemoryOperationStore
  implements OperationStore {
  private operations = new Map<
    string,
    StoredOperation[]
  >();

  private versions = new Map<string, number>();

  private operationVersions = new Map<
    string,
    Map<string, StoredOperation>
  >();

  async append(
    documentId: string,
    operation: Operation,
  ): Promise<StoredOperation> {
    let documentOperationVersions =
      this.operationVersions.get(documentId);

    if (!documentOperationVersions) {
      documentOperationVersions = new Map();
      this.operationVersions.set(
        documentId,
        documentOperationVersions,
      );
    }

    const operationKey =
      `${operation.id.clientId}:${operation.id.sequence}`;

    const existing =
      documentOperationVersions.get(operationKey);

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

    const storedOperation: StoredOperation = {
      version: nextVersion,
      operation,
    };

    const operations =
      this.operations.get(documentId) ?? [];

    operations.push(storedOperation);

    this.operations.set(documentId, operations);
    this.versions.set(documentId, nextVersion);

    documentOperationVersions.set(
      operationKey,
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
  ): Promise<StoredOperation[]> {
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
  ): Promise<StoredOperation | null> {
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