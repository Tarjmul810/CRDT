import type { ClientMessage } from "./protocol";
import type { Operation } from "../crdt/type";

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

export function validateMessage(
  message: unknown
): message is ClientMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const data = message as Record<string, unknown>;

  if (data.type === "join") {
    return (
      typeof data.documentId === "string" &&
      data.documentId.length > 0
    );
  }

  if (data.type === "operation") {
    return isValidOperation(data.operation);
  }

  return false;
}