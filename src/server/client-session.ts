import { randomUUID } from "node:crypto";
import type { Operation, ElementId } from "../crdt/type";

export class ClientSession {
  public readonly sessionId: string;
  public readonly clientId: string;

  private lastSequence = 0;

  constructor(
    public readonly userId: string,
    clientId?: string
  ) {
    this.sessionId = randomUUID();
    this.clientId = clientId ?? randomUUID();
  }

  validateOperationIdentity(operationId: ElementId): boolean {
  if (operationId.clientId !== this.clientId) {
    return false;
  }

  const sequence = operationId.sequence;

  if (sequence <= this.lastSequence) {
    return false;
  }

  this.lastSequence = sequence;

  return true;
}

  getLastSequence(): number {
    return this.lastSequence;
  }
}