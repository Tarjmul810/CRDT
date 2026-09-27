import type { Operation } from "../crdt/type";

export type StoredOperation = {
  version: number;
  operation: Operation;
};

export interface OperationStore {
    append(
        documentId: string,
        operation: Operation
    ): Promise<StoredOperation>;

    getOperations(
        documentId: string,
        afterVersion?: number
    ): Promise<StoredOperation[]>;
}