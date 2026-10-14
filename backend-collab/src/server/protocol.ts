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

export type PresenceUser = {
  clientId: string;
  // Add a display name later if needed.
};

export type PresenceUpdateMessage = {
  type: "presence_update";
  documentId: string;
  users: PresenceUser[];
};

export type PresenceChangedMessage = {
  type: "presence_changed";
  documentId: string;
  users: PresenceUser[];
};

export type CursorUpdateMessage = {
  type: "cursor_update";
  blockId: string;
  offset: number;
};

export type RemoteCursor = {
  clientId: string;
  blockId: string;
  offset: number;
};

export type CursorChangedMessage = {
  type: "cursor_changed";
  cursor: RemoteCursor;
};

export type CursorRemovedMessage = {
  type: "cursor_removed";
  clientId: string;
};


export type ClientMessage =
  | AuthMessage
  | JoinMessage
  | OperationMessage 
  | SyncMessage;