import type { ClientMessage } from "./protocol";
import type { Operation } from "../crdt/type";
import type { DocumentOperation } from "../document/operations";

function isValidElementId(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const id = value as Record<string, unknown>;

  return (
    typeof id.clientId === "string" &&
    id.clientId.length > 0 &&
    Number.isInteger(id.sequence) &&
    Number(id.sequence) > 0
  );
}

function isValidInsertOperation(
  operation: Record<string, unknown>
): boolean {
  if (!isValidElementId(operation.id)) {
    return false;
  }

  if (
    typeof operation.element !== "object" ||
    operation.element === null
  ) {
    return false;
  }

  const element = operation.element as Record<string, unknown>;

  if (!isValidElementId(element.id)) {
    return false;
  }

  // The operation ID and element ID must refer to
  // the same element.
  const operationId = operation.id as {
    clientId: string;
    sequence: number;
  };

  const elementId = element.id as {
    clientId: string;
    sequence: number;
  };

  if (
    operationId.clientId !== elementId.clientId ||
    operationId.sequence !== elementId.sequence
  ) {
    return false;
  }

  if (typeof element.value !== "string") {
    return false;
  }

  if (typeof element.deleted !== "boolean") {
    return false;
  }

  // `after` can either be null or another valid ElementId.
  if (
    element.after !== null &&
    !isValidElementId(element.after)
  ) {
    return false;
  }

  return true;
}

function isValidDeleteOperation(
  operation: Record<string, unknown>
): boolean {
  if (!isValidElementId(operation.id)) {
    return false;
  }

  if (!isValidElementId(operation.target)) {
    return false;
  }

  return true;
}

function isValidOperation(
  operation: unknown
): operation is Operation {
  if (typeof operation !== "object" || operation === null) {
    return false;
  }

  const op = operation as Record<string, unknown>;

  if (op.type === "insert") {
    return isValidInsertOperation(op);
  }

  if (op.type === "delete") {
    return isValidDeleteOperation(op);
  }

  return false;
}

function isValidDocumentOperation(
  operation: unknown
): operation is DocumentOperation {
  if (typeof operation !== "object" || operation === null) {
    return false;
  }

  const op = operation as Record<string, unknown>;

  if (op.type !== "insert_block" && op.type !== "delete_block") {
    return false;
  }

  if (!isValidElementId(op.id)) {
    return false;
  }

  if (op.type === "insert_block") {
    if (typeof op.block !== "object" || op.block === null) {
      return false;
    }

    const block = op.block as Record<string, unknown>;

    if ( block.id === undefined || (block.id as string).length === 0) {
      return false;
    }

    if (block.type !== "paragraph") {
      return false;
    }
  }

  return true;
}

function isValidVersionVector(value: unknown): boolean {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const vector = value as Record<string, unknown>;

  for (const [clientId, sequence] of Object.entries(vector)) {
    if (clientId.length === 0) {
      return false;
    }

    if (!Number.isInteger(sequence) || Number(sequence) < 0) {
      return false;
    }
  }

  return true;
}

export function validateMessage(message: unknown): boolean {
  if (!message || typeof message !== "object") {
    return false;
  }

  const msg = message as Record<string, unknown>;

  if (msg.type === "authenticate") {
  if (typeof msg.token !== "string") {
    return false;
  }

  if (
    msg.clientId !== undefined &&
    typeof msg.clientId !== "string"
  ) {
    return false;
  }

  return true;
}

  if (msg.type === "join") {
    return (
      typeof msg.documentId === "string" &&
      msg.documentId.length > 0
    );
  }

  if (msg.type === "operation") {
    return isValidOperation(msg.operation);
  }

  if (msg.type === "document_operation") {
    return isValidDocumentOperation(msg.operation);
  }

  if (msg.type === "sync") {
    return isValidVersionVector(msg.versionVector);

  }

  if (msg.type === "document_sync_request") {
     return (
        typeof msg.afterVersion === "number" &&
        Number.isInteger(msg.afterVersion) &&
        msg.afterVersion >= 0
      );
  }

  return false;
}