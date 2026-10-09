import { randomUUID } from "node:crypto";
import type { Operation, ElementId } from "../crdt/type";
import type { DocumentOperation } from "../shared";

export class ClientSession {
  public readonly sessionId: string;
  public readonly clientId: string;
  private lastSequences =
    new Map<DocumentOperation["type"], number>();

  constructor(
    public readonly userId: string,
    clientId?: string
  ) {
    this.sessionId = randomUUID();
    this.clientId = clientId ?? randomUUID();
  }

  validateOperationIdentity(
    operationId: ElementId,
    operationType: DocumentOperation["type"],
  ): boolean {
    if (
      typeof operationId.clientId !== "string" ||
      operationId.clientId.length === 0
  ) {
      return false;
    }

    const sequence =
      operationId.sequence;

    if (
      !Number.isInteger(
        operationId.sequence,
      ) ||
      operationId.sequence <= 0
    ) {
      return false;
    }

    this.lastSequences.set(
      operationType,
      sequence,
    );

    return true;
  }
}