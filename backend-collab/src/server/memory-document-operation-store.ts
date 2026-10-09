import type { DocumentOperation } from "../document/operations";
import type {
  StoredDocumentOperation,
  DocumentOperationStore,
} from "./document-operation-store";
import type { ElementId } from "../crdt/type";

export class InMemoryDocumentOperationStore
  implements DocumentOperationStore
{
  private operations = new Map<
    string,
    StoredDocumentOperation[]
  >();

  private versions = new Map<string, number>();

  private operationVersions = new Map<
    string,
    Map<string, StoredDocumentOperation>
  >();

  private getOperationId(
    operation: DocumentOperation,
  ): ElementId {
    return operation.id;
  }

  /**
   * Creates the canonical identity used for storing
   * and deduplicating a document operation.
   *
   * Text operations are scoped to a block because each
   * BlockContent owns its own RGA and therefore sequence
   * numbers can repeat across different blocks.
   */
  private getOperationKey(
    operation: DocumentOperation,
  ): string {
    const operationId =
      this.getOperationId(operation);

    const blockId =
      "blockId" in operation
        ? operation.blockId
        : "";

    return [
      operation.type,
      blockId,
      operationId.clientId,
      operationId.sequence,
    ].join(":");
  }

  /**
   * Creates the same canonical key when looking up
   * an operation from its individual fields.
   */
  private getLookupKey(
    operationType: DocumentOperation["type"],
    operationId: ElementId,
    blockId?: string,
  ): string {
    return [
      operationType,
      blockId ?? "",
      operationId.clientId,
      operationId.sequence,
    ].join(":");
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

    const operationKey =
      this.getOperationKey(operation);

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

    const storedOperation: StoredDocumentOperation = {
      version: nextVersion,
      operation,
    };

    const operations =
      this.operations.get(documentId) ?? [];

    operations.push(storedOperation);

    this.operations.set(
      documentId,
      operations,
    );

    this.versions.set(
      documentId,
      nextVersion,
    );

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
    afterVersion = 0,
  ): Promise<StoredDocumentOperation[]> {
    const operations =
      this.operations.get(documentId) ?? [];

    return operations
      .filter(
        (item) =>
          item.version > afterVersion,
      )
      .map((item) => ({
        version: item.version,
        operation: item.operation,
      }));
  }

  async getOperation(
    documentId: string,
    operationType: DocumentOperation["type"],
    operationId: ElementId,
    blockId?: string,
  ): Promise<StoredDocumentOperation | null> {
    const documentOperationVersions =
      this.operationVersions.get(documentId);

    if (!documentOperationVersions) {
      return null;
    }

    const operationKey =
      this.getLookupKey(
        operationType,
        operationId,
        blockId,
      );

    return (
      documentOperationVersions.get(
        operationKey,
      ) ?? null
    );
  }
}