import { WebSocket } from "ws";
import type { ElementId } from "../crdt/type";
import type { DocumentOperation } from "../document/operations";
import { DocumentSession } from "../document/document-session";
import type { LocalStore } from "./local-store";
import type { DocumentSyncOperation } from "../document/protocol";

export class DocumentSyncClient {
  private socket: WebSocket;
  private serverVersion = 0;
  private readonly appliedOperations = new Set<string>();

  constructor(
    socket: WebSocket,
    private readonly session: DocumentSession,
    private readonly documentId: string,
    private readonly localStore: LocalStore,
  ) {
    this.socket = socket;
    this.attachSocket(socket);
  }

  private getOperationKey(operationId: ElementId): string {
    return `${operationId.clientId}:${operationId.sequence}`;
  }

  private hasAppliedOperation(operationId: ElementId): boolean {
    return this.appliedOperations.has(
      this.getOperationKey(operationId),
    );
  }

  private markOperationApplied(operationId: ElementId): void {
    this.appliedOperations.add(
      this.getOperationKey(operationId),
    );
  }

  private attachSocket(socket: WebSocket): void {
    if (typeof socket.on !== "function") {
      return;
    }

    socket.on("message", (data) => {
      try {
        const message = JSON.parse(
          data.toString(),
        );

        void this.handleMessage(message);
      } catch {
        // Ignore malformed messages for now.
      }
    });
  }


  private getOperationId(
    operation: DocumentOperation,
  ): ElementId {
      return operation.id;
    
  }

  private async handleOperationAck(
    operationId: ElementId,
  ): Promise<void> {

    await this.localStore.removePendingOperation(
      this.documentId,
      operationId,
    );
  }

  private async handleDocumentSync(
    operations: DocumentSyncOperation[],
  ): Promise<void> {
    for (const entry of operations) {
      const operationId = this.getOperationId(entry.operation);

      if (this.hasAppliedOperation(operationId)) {

        this.serverVersion = Math.max(
          this.serverVersion,
          entry.version,
        );
        continue;
      }

      this.session.applyOperation(entry.operation);
      this.markOperationApplied(operationId);
      this.serverVersion = Math.max(
        this.serverVersion,
        entry.version,
      );
    }
  }

  async handleMessage(message: unknown): Promise<void> {
    if (
      typeof message !== "object" ||
      message === null
    ) {
      return;
    }

    const msg = message as Record<
      string,
      unknown
    >;

    if (msg.type === "document_operation") {
      const operation =
        msg.operation as DocumentOperation;

      const operationId = this.getOperationId(operation);

      if (operationId.clientId === this.session.getClientId()) {
        return;
      }

      if (this.hasAppliedOperation(operationId)) {
        return;
      }


      this.session.applyOperation(
        operation,
      );

      return;
    }

    if (msg.type === "document_operation_ack") {
      await this.handleOperationAck(msg.operationId as ElementId);
      return;
    }

    if (msg.type === "document_sync") {

      await this.handleDocumentSync(msg.operations as DocumentSyncOperation[]);
      return;
    }
  }


  async resendPendingOperations(): Promise<void> {
    const operations =
      await this.localStore.getPendingOperations(this.documentId);

    if (this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    for (const operation of operations) {
      this.socket.send(
        JSON.stringify({
          type: "document_operation",
          operation,
        }),
      );
    }
  }

  replaceSocket(socket: WebSocket): void {
    this.socket = socket;
    this.attachSocket(socket);
  }

  requestSync(afterVersion = 0): void {
    if (this.socket.readyState !== 1) {
      return;
    }

    this.socket.send(
      JSON.stringify({
        type: "document_sync_request",
        afterVersion,
      }),
    );
  }

  getServerVersion(): number {
    return this.serverVersion;
  }

  addPendingOperation(operation: DocumentOperation): void {
    this.localStore.savePendingOperation(
      this.documentId,
      operation,
    );
  }

  async getPendingOperations(): Promise<DocumentOperation[]> {
    return this.localStore.getPendingOperations(this.documentId);
  }

  async applyLocalOperation(
    operation: DocumentOperation,
  ): Promise<void> {

    const operationId = this.getOperationId(operation);

    // 1. Apply immediately to the local document.
    this.session.applyOperation(operation);

    this.markOperationApplied(operationId);

    // 2. Persist it before attempting to send it.
    await this.localStore.savePendingOperation(
      this.documentId,
      operation,
    );

    // 3. Send it to the server if the socket is open.
    if (this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(
      JSON.stringify({
        type: "document_operation",
        operation,
      }),
    );
  }

  async reconnect(socket: WebSocket): Promise<void> {
    this.socket = socket;

    this.attachSocket(socket);

    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.requestSync(this.serverVersion);

    await this.resendPendingOperations();
  }
}