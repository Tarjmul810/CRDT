import type {
  DocumentSnapshot,
  DocumentStore,
} from "./document-store";

export class InMemoryDocumentStore
  implements DocumentStore
{
  private snapshots = new Map<
    string,
    DocumentSnapshot
  >();

  async saveSnapshot(
    snapshot: DocumentSnapshot
  ): Promise<void> {
    this.snapshots.set(
      snapshot.documentId,
      structuredClone(snapshot)
    );
  }

  async getSnapshot(
    documentId: string
  ): Promise<DocumentSnapshot | null> {
    const snapshot =
      this.snapshots.get(documentId);

    if (!snapshot) {
      return null;
    }

    return structuredClone(snapshot);
  }
}