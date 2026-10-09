import type { Operation } from "../crdt/type";

export type AuthMessage = {
  type: "authenticate";
  token: string;
  clientId?: string;
};

export type JoinMessage = {
  type: "join";
  documentId: string;
};

export type OperationMessage = {
  type: "operation";
  operation: Operation;
};

export type SyncMessage = {
  type: "sync";
  versionVector: Record<string, number>;
};

export type OperationAckMessage = {
  type: "operation_ack";
  operationId: {
    clientId: string;
    sequence: number;
  };
};


export type ClientMessage =
  | AuthMessage
  | JoinMessage
  | OperationMessage 
  | SyncMessage;