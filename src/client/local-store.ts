import type { Operation } from "../crdt/type";
import type { RGAState } from "../crdt/rga";

export type LocalDocument = {
  documentId: string;
  state: RGAState
};

export interface LocalStore {
  saveDocument(document: LocalDocument): Promise<void>;

  loadDocument(documentId: string): Promise<LocalDocument | null>;

  savePendingOperation(
    documentId: string,
    operation: Operation
  ): Promise<void>;

  removePendingOperation(
    documentId: string,
    operationId: {
      clientId: string;
      sequence: number;
    }
  ): Promise<void>;

  getPendingOperations(documentId: string): Promise<Operation[]>;
}