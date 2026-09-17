import type { Operation } from "../crdt/type";

export type JoinMessage = {
  type: "join";
  documentId: string;
};

export type OperationMessage = {
  type: "operation";
  operation: Operation;
};

export type ClientMessage =
  | JoinMessage
  | OperationMessage;