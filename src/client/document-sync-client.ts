import { WebSocket } from "ws";
import type { ElementId } from "../crdt/type";
import type { DocumentOperation } from "../document/operations";
import { DocumentSession } from "../document/document-session";
import type { LocalStore } from "./local-store";
import { get } from "http";

export class DocumentSyncClient {
  private socket: WebSocket;

  constructor(
    socket: WebSocket,
    private readonly session: DocumentSession,
    private readonly documentId: string,
    private readonly localStore: LocalStore,
  ) {
    this.socket = socket;
    this.attachSocket(socket);
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
    if (
      operation.type === "insert_block" ||
      operation.type === "delete_block"
    ) {
      return operation.id;
    }

    return operation.operation.id;
  }

  private async handleOperationAck(
    operationId: ElementId,
  ): Promise<void> {

    await this.localStore.removePendingOperation(
      this.documentId,
      operationId,
    );
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

      this.session.applyOperation(
        operation,
      );

      await this.localStore.removePendingOperation(
        this.documentId,
        this.getOperationId(operation),
      );

      return;
    }

    if (msg.type === "document_operation_ack") {
      await this.handleOperationAck(msg.operationId as ElementId);
      return;
    }

    if (msg.type === "document_sync") {
      const operations =
        msg.operations as Array<{
          version: number;
          operation: DocumentOperation;
        }>;

      for (const item of operations) {
        this.session.applyOperation(
          item.operation,
        );
      }

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
  // 1. Apply immediately to the local document.
  this.session.applyOperation(operation);

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
}