import { randomUUID } from "node:crypto";
import type { Operation } from "../crdt/type";

export class ClientSession {
  public readonly clientId: string;

  private lastSequence = 0;

  constructor() {
    this.clientId = randomUUID();
  }

  validateOperationIdentity(operation: Operation): boolean {
    // The operation must belong to this connection.
    if (operation.id.clientId !== this.clientId) {
      return false;
    }

    const sequence = operation.id.sequence;

    // Sequence must be a positive integer.
    if (!Number.isInteger(sequence) || sequence <= 0) {
      return false;
    }

    // Reject reused or older sequence numbers.
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