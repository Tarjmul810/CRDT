import type { ElementId, InsertOperation, DeleteOperation } from "../crdt/type";
import type { Block } from "./types";

export type InsertBlockOperation = {
  type: "insert_block";
  id: ElementId;
  block: Block;
  after: ElementId | null;
  blockId?: string;
};

export type DeleteBlockOperation = {
  type: "delete_block";
  id: ElementId;
  blockId: string;
};

export type InsertTextOperation = {
  type: "insert_text";
  blockId: string;
  operation: InsertOperation;
};

export type DeleteTextOperation = {
  type: "delete_text";
  blockId: string;
  operation: DeleteOperation;
};

export type DocumentOperation =
  | InsertBlockOperation
  | DeleteBlockOperation 
  | InsertTextOperation
  | DeleteTextOperation;  