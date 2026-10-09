"use client";

import type {
  DocumentOperation,
  ElementId,
} from "backend-collab/shared";

import type { DocumentSession } from "./document-session";

type DocumentSyncOperation = {
  version: number;
  operation: DocumentOperation;
};

type DocumentSyncClientOptions = {
  url: string;
  token: string;
  clientId: string;
  documentId: string;
  session: DocumentSession;
};

export class DocumentSyncClient {
  private socket: WebSocket | null = null;

  private readonly url: string;
  private readonly token: string;
  private readonly clientId: string;
  private readonly documentId: string;
  private readonly session: DocumentSession;

  private serverVersion = 0;

  /**
   * Operations that have already been applied to the
   * local DocumentSession.
   *
   * This prevents us from applying our own operation
   * again if it comes back from the server.
   */
  private readonly appliedOperations =
    new Set<string>();

  /**
   * Operations that still need to be acknowledged
   * by the server.
   *
   * We keep them here across reconnects.
   */
  private readonly pendingOperations =
    new Map<string, DocumentOperation>();

  /**
   * The WebSocket may be OPEN while authentication
   * and document joining are still in progress.
   */
  private authenticated = false;
  private joined = false;
  private syncComplete = false;

  constructor(
    options: DocumentSyncClientOptions,
  ) {
    this.url = options.url;
    this.token = options.token;
    this.clientId = options.clientId;
    this.documentId = options.documentId;
    this.session = options.session;
  }

  
  connect(): void {
  if (
    this.socket &&
    (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    )
  ) {
    return;
  }

  this.authenticated = false;
  this.joined = false;
  this.syncComplete = false;

  const socket = new WebSocket(this.url);

  this.socket = socket;

  socket.onopen = () => {
   
    socket.send(
      JSON.stringify({
        type: "authenticate",
        token: this.token,
        clientId: this.clientId,
      }),
    );
  };

  socket.onmessage = (event) => {
  
    try {
      const message = JSON.parse(event.data);

      console.log("📨 PARSED MESSAGE:", message);

      this.handleMessage(message);
    } catch (error) {
      console.error(
        "❌ FAILED TO PARSE MESSAGE:",
        this.clientId,
        error,
      );
    }
  };

  socket.onerror = (error) => {
    console.error(
      "❌ SOCKET ERROR:",
      this.clientId,
      error,
    );
  };

  socket.onclose = (event) => {

    if (this.socket === socket) {
      this.socket = null;
    }

    this.authenticated = false;
    this.joined = false;
    this.syncComplete = false;
  };
}

private handleMessage(
  message: unknown,
): void {
  if (
    typeof message !== "object" ||
    message === null
  ) {
    return;
  }

  const msg =
    message as Record<string, unknown>;

  if (msg.type === "authenticated") {
    this.authenticated = true;

    this.joinDocument();

    return;
  }

  if (msg.type === "joined") {
    this.joined = true;

    this.requestSync();

    return;
  }

  if (msg.type === "document_sync") {

    this.handleDocumentSync(
      msg.operations as DocumentSyncOperation[],
    );

    this.syncComplete = true;

    this.flushPendingOperations();

    return;
  }

  if (msg.type === "document_operation") {
    console.log(
      "📥 REMOTE DOCUMENT OPERATION:",
      this.clientId,
      msg.operation,
    );

    this.handleRemoteOperation(
      msg.operation as DocumentOperation,
    );

    return;
  }

  if (
    msg.type === "document_operation_ack"
  ) {
    const operationId =
      msg.operationId as ElementId;

    console.log(
      "✅ OPERATION ACK:",
      this.clientId,
      operationId,
    );

    const operationKey = this.findPendingOperationKey(
      operationId,
    );

    this.pendingOperations.delete(
      operationKey!,
    );

    return;
  }

  if (msg.type === "error") {
    console.error(
      "❌ SERVER ERROR:",
      this.clientId,
      msg.message,
    );

    return;
  }

  console.log(
    "⚠️ UNHANDLED WS MESSAGE:",
    this.clientId,
    msg,
  );
}
 
  private handleDocumentSync(
    operations: DocumentSyncOperation[],
  ): void {

    for (const entry of operations) {
      this.serverVersion = Math.max(
        this.serverVersion,
        entry.version,
      );

      const operation = entry.operation;

      const operationKey =
        this.operationKey(operation);

      if (
        this.appliedOperations.has(
          operationKey,
        )
      ) {
        continue;
      }

      this.session.applyOperation(
        operation,
      );

      this.appliedOperations.add(
        operationKey,
      );
    }
  }

  private handleRemoteOperation(
    operation: DocumentOperation,
  ): void {
    const operationKey =
      this.operationKey(operation);

    /*
     * Local operations have already been applied
     * to our DocumentSession.
     *
     * Never apply them a second time.
     */
    if (
      this.appliedOperations.has(
        operationKey,
      )
    ) {
      console.log("🔴 IGNORING DUPLICATE OPERATION:", operationKey);
      return;
    }

    this.session.applyOperation(
      operation,
    );

    this.appliedOperations.add(
      operationKey,
    );
  }

  private findPendingOperationKey(
  operationId: ElementId,
): string | null {
  for (const [
    operationKey,
    operation,
  ] of this.pendingOperations) {
    if (
      operation.id.clientId ===
        operationId.clientId &&
      operation.id.sequence ===
        operationId.sequence
    ) {
      return operationKey;
    }
  }

  return null;
}

  private operationKey(
  operation: DocumentOperation,
): string {
  const id = operation.id;

  return [
    operation.type,
    "blockId" in operation
      ? operation.blockId
      : "",
    id.clientId,
    id.sequence,
  ].join(":");
}

  private joinDocument(): void {
    if (
      !this.socket ||
      this.socket.readyState !==
        WebSocket.OPEN
    ) {
      return;
    }

    this.socket.send(
      JSON.stringify({
        type: "join",
        documentId: this.documentId,
      }),
    );
  }

  private requestSync(): void {
    if (
      !this.socket ||
      this.socket.readyState !==
        WebSocket.OPEN
    ) {
      return;
    }

    this.socket.send(
      JSON.stringify({
        type: "document_sync_request",
        afterVersion: this.serverVersion,
      }),
    );
  }

  sendLocalOperation(
    operation: DocumentOperation,
  ): void {

    const operationKey =
      this.operationKey(operation);

    /*
     * The operation has already been applied
     * locally by DocumentSession.
     */
    this.appliedOperations.add(
      operationKey,
    );

    /*
     * Remember it until the server ACKs it.
     *
     * This is the important change:
     * CONNECTING no longer means "discard".
     */
    this.pendingOperations.set(
      operationKey,
      operation,
    );

    this.flushPendingOperations();
  }

  private flushPendingOperations(): void {
    /*
     * We only send after:
     *
     * OPEN
     *   ↓
     * authenticated
     *   ↓
     * joined
     *   ↓
     * initial sync complete
     */
    if (
      !this.socket ||
      this.socket.readyState !==
        WebSocket.OPEN
    ) {
      return;
    }

    if (!this.authenticated) {
      return;
    }

    if (!this.joined) {
      return;
    }

    if (!this.syncComplete) {
      return;
    }

    for (
      const [
        operationKey,
        operation,
      ] of this.pendingOperations
    ) {
      /*
       * It may have been ACKed while we were
       * iterating, so check again.
       */
      if (
        !this.pendingOperations.has(
          operationKey,
        )
      ) {
        continue;
      }

      this.socket.send(
        JSON.stringify({
          type: "document_operation",
          operation,
        }),
      );
    }
  }

  getServerVersion(): number {
    return this.serverVersion;
  }

  disconnect(): void {
    /*
     * IMPORTANT:
     *
     * Do NOT clear pendingOperations here.
     *
     * If React Strict Mode or a real network
     * disconnect closes the socket before an ACK,
     * those operations must survive and be sent
     * again on the next connection.
     */
    this.authenticated = false;
    this.joined = false;
    this.syncComplete = false;

    this.socket?.close();
    this.socket = null;
  }
}