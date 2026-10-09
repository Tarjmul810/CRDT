import { WebSocket } from "ws";
import { RGA } from "../crdt/rga";
import type { Operation, ElementId } from "../crdt/type";
import type { OperationStore } from "./operation-store";
import type { DocumentStore } from "./document-store";
import { DocumentSession } from "../document/document-session";
import type { DocumentStateSnapshot } from "../document/document-state-snapshot";
import type { DocumentOperation } from "../document/operations";
import type { DocumentOperationStore, StoredDocumentOperation } from "./document-operation-store";

export class Room {
  private clients = new Set<WebSocket>();
  private restored = false;

  private static readonly SNAPSHOT_INTERVAL = 100;
  private currentVersion = 0

  constructor(
    public readonly documentId: string,
    private readonly rga: RGA,
    private readonly operationStore: OperationStore,
    private readonly documentStore: DocumentStore,
    private readonly documentSession: DocumentSession,
    private readonly documentOperationStore: DocumentOperationStore
  ) { }

  private async createSnapshot(): Promise<void> {
    await this.documentStore.saveSnapshot({
      documentId: this.documentId,
      state: this.rga.serialize(),
      version: this.currentVersion,
    });
  }

  private getDocumentOperationId(operation: DocumentOperation): ElementId {
    return operation.id;
  }

  addClient(socket: WebSocket): void {
  this.clients.add(socket);
}

removeClient(socket: WebSocket): void {
  this.clients.delete(socket);
}

  broadcast(
    operation: Operation,
    sender: WebSocket
  ): void {
    const message = JSON.stringify({
      type: "operation",
      operation,
    });

    for (const client of this.clients) {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  applyOperation(operation: Operation): void {
    this.rga.apply(operation);
  }

  async handleOperation(
    operation: Operation,
    sender: WebSocket
  ): Promise<boolean> {

    const existingOperation =
      await this.operationStore.getOperation(
        this.documentId,
        operation.id,
      )

    if (existingOperation) {
      console.log("📨 RETRANSMISSION:", operation.id);
      return false
    }

    this.rga.apply(operation);

    const storedOperation = await this.operationStore.append(
      this.documentId,
      operation
    );

    this.currentVersion = storedOperation.version;

    if (this.currentVersion % Room.SNAPSHOT_INTERVAL === 0) {
      await this.createSnapshot();
    }

    this.broadcast(
      operation,
      sender
    );

    return true
  }

  async getOperations(): Promise<Operation[]> {
    const storedOperations = await this.operationStore.getOperations(
      this.documentId,
    );

    return storedOperations.map(
      (storedOperation) => storedOperation.operation,
    );
  }

  async restore(): Promise<void> {
    if (this.restored) {
      return;
    }
    const snapshot =
      await this.documentStore.getSnapshot(
        this.documentId
      );


    const snapshotVersion = snapshot?.version ?? 0;

    if (snapshot) {
      this.rga.restore(snapshot.state);
    }

    const operations =
      await this.operationStore.getOperations(
        this.documentId,
        snapshotVersion
      );

    for (const storedOperation of operations) {
      this.rga.apply(
        storedOperation.operation
      );
    }

    if (operations.length > 0) {
      this.currentVersion =
        operations[operations.length - 1]?.version ?? snapshotVersion;
    } else {
      this.currentVersion = snapshotVersion;
    }

    this.restored = true;
  }

  getText(): string {
    return this.rga.getText();
  }

  getVersionVector(): Record<string, number> {
    return this.rga.serialize().versionVector;
  }

  applyDocumentOperation(
    operation: DocumentOperation
  ): void {
    this.documentSession.applyOperation(operation);
  }

  getDocumentSnapshot(): DocumentStateSnapshot {
    return this.documentSession.serialize();
  }

  broadcastDocumentOperation(
  operation: DocumentOperation,
  sender?: WebSocket,
): void {

  const message = JSON.stringify({
    type: "document_operation",
    operation,
  });

  for (const client of this.clients) {

    if (client === sender) {
      continue;
    }

    if (client.readyState === WebSocket.OPEN) {

      client.send(message);
    }
  }
}

  async handleDocumentOperation(
    operation: DocumentOperation,
    sender?: WebSocket,
  ): Promise<StoredDocumentOperation> {
    // 1. Check whether operation already exists
    const operationId = this.getDocumentOperationId(operation);

    const existing =
      await this.documentOperationStore.getOperation(
        this.documentId,
        operation.type,
        operationId,
      );

    if (existing) {
      return existing;
    }

    // 2. Apply to document state
    this.documentSession.applyOperation(operation);

    // 3. Persist
    const stored =
      await this.documentOperationStore.append(
        this.documentId,
        operation,
      );

    // 4. Broadcast
    this.broadcastDocumentOperation(
      operation,
      sender,
    );

    return stored;
  }

  async getDocumentOperations(
    afterVersion = 0,
  ): Promise<StoredDocumentOperation[]> {
    return this.documentOperationStore.getOperations(
      this.documentId,
      afterVersion,
    );
  }
}
