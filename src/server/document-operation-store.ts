import type { DocumentOperation } from "../document/operations";
import type { ElementId } from "../crdt/type";

export type StoredDocumentOperation = {
  version: number;
  operation: DocumentOperation;
};

export interface DocumentOperationStore {
  append(
    documentId: string,
    operation: DocumentOperation,
  ): Promise<StoredDocumentOperation>;

  getOperations(
    documentId: string,
    afterVersion?: number,
  ): Promise<StoredDocumentOperation[]>;

  getOperation(
    documentId: string,
    operationId: ElementId,
  ): Promise<StoredDocumentOperation | null>;
}