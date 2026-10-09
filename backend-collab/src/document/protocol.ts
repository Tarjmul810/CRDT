import type { ElementId } from "../crdt/type";
import type { DocumentOperation } from "./operations";

export type DocumentOperationMessage = {
  type: "document_operation";
  operation: DocumentOperation;
};

export type DocumentOperationAck = {
  type: "document_operation_ack";
  operationId: ElementId;
};

export type DocumentSyncRequest = {
  type: "document_sync_request";
  afterVersion: number;
};

export type DocumentSyncOperation = {
  version: number;
  operation: DocumentOperation;
};

export type DocumentSyncMessage = {
  type: "document_sync";
  operations: DocumentSyncOperation[];
};

export type DocumentMessage =
  | DocumentOperationMessage
  | DocumentOperationAck
  | DocumentSyncRequest
  | DocumentSyncMessage;