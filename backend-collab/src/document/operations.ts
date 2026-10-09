import type {
  ElementId,
  InsertOperation,
  DeleteOperation,
} from "../crdt/type";

import type { Block } from "./types";

export type InsertBlockOperation = {
  type: "insert_block";

  // Document-level operation identity.
  id: ElementId;

  blockId: string;

  // Actual block RGA operation.
  operation: InsertOperation;

  block: Block;
  after: ElementId | null;
};

export type DeleteBlockOperation = {
  type: "delete_block";

  // Document-level operation identity.
  id: ElementId;

  blockId: string;

  // Actual block RGA operation.
  operation: DeleteOperation;
};

export type InsertTextOperation = {
  type: "insert_text";

  // Document-level operation identity.
  id: ElementId;

  blockId: string;

  // Actual text RGA operation.
  operation: InsertOperation;
};

export type DeleteTextOperation = {
  type: "delete_text";

  // Document-level operation identity.
  id: ElementId;

  blockId: string;

  // Actual text RGA operation.
  operation: DeleteOperation;
};

export type DocumentOperation =
  | InsertBlockOperation
  | DeleteBlockOperation
  | InsertTextOperation
  | DeleteTextOperation;