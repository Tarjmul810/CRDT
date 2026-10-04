import type { DocumentOperation } from "./operations";

export type DocumentOperationMessage = {
  type: "document_operation";
  operation: DocumentOperation;
};

export type DocumentSyncRequest = {
  type: "document_sync_request";
  afterVersion: number;
};

export type DocumentSyncMessage = {
  type: "document_sync";
  operations: DocumentOperation[];
};

export type DocumentMessage =
  | DocumentOperationMessage
  | DocumentSyncRequest
  | DocumentSyncMessage;