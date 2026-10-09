import type { RGAState } from "../crdt/rga";

export type DocumentSnapshot = {
  documentId: string;
  state: RGAState;
  version: number;
};

export interface DocumentStore {
  saveSnapshot(
    snapshot: DocumentSnapshot
  ): Promise<void>;

  getSnapshot(
    documentId: string
  ): Promise<DocumentSnapshot | null>;
}