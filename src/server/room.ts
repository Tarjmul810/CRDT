import { WebSocket } from "ws";
import { RGA } from "../crdt/rga";
import type { Operation } from "../crdt/type";
import type { OperationStore } from "./operation-store";
import type { DocumentStore } from "./document-store";

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
  ) { }

  private async createSnapshot(): Promise<void> {
    await this.documentStore.saveSnapshot({
      documentId: this.documentId,
      state: this.rga.serialize(),
      version: this.currentVersion,
    });
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
}
