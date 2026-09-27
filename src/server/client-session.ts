import { randomUUID } from "node:crypto";
import type { Operation } from "../crdt/type";

export class ClientSession {
  public readonly sessionId: string;
  public readonly clientId: string;

  private lastSequence = 0;

  constructor(
    public readonly userId: string,
    sessionId?: string,
    clientId?: string
  ) {
    this.sessionId = sessionId ?? randomUUID();
    this.clientId = clientId ?? randomUUID();
  }

  validateOperationIdentity(operation: Operation): boolean {
    if (operation.id.clientId !== this.clientId) {
      return false;
    }

    const sequence = operation.id.sequence;

    if (!Number.isInteger(sequence) || sequence <= 0) {
      return false;
    }

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