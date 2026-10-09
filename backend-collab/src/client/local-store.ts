import type { ElementId } from "../crdt/type";
import type { DocumentOperation } from "../document/operations";
import type { DocumentStateSnapshot } from "../document/document-state-snapshot";

export type LocalDocument = {
  documentId: string;
  state: DocumentStateSnapshot;
};

export interface LocalStore {
  saveDocument(document: LocalDocument): Promise<void>;

  loadDocument(documentId: string): Promise<LocalDocument | null>;

  savePendingOperation(
    documentId: string,
    operation: DocumentOperation,
  ): Promise<void>;

  removePendingOperation(
    documentId: string,
    operationId: ElementId,
  ): Promise<void>;

  getPendingOperations(
    documentId: string,
  ): Promise<DocumentOperation[]>;
}