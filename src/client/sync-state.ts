import { RGA } from "../crdt/rga";
import { VersionVector } from "../crdt/version-vector";
import type {
  ElementId,
  Operation,
} from "../crdt/type";

export class SyncState {
  private readonly rga: RGA;
  private readonly acknowledgedVersionVector =
    new VersionVector();

  constructor(clientId: string) {
    this.rga = new RGA(clientId);
  }

  insert(
    value: string,
    after: ElementId | null,
  ): Operation {
    return this.rga.insert(value, after);
  }

  delete(target: ElementId) {
    return this.rga.delete(target);
  }

  applyOperation(operation: Operation): void {
    this.rga.apply(operation);
  }

  applyOperations(operations: Operation[]): void {
    for (const operation of operations) {
      this.applyOperation(operation);
    }
  }

  acknowledgeOperation(
    operationId: {
      clientId: string;
      sequence: number;
    },
  ): void {
    this.acknowledgedVersionVector.update(
      operationId.clientId,
      operationId.sequence,
    );
  }

  acknowledgeOperations(
    operations: Operation[],
  ): void {
    for (const operation of operations) {
      this.acknowledgeOperation(operation.id);
    }
  }

  getVersionVector(): Record<string, number> {
    return this.rga.serialize().versionVector;
  }

  getAcknowledgedVersionVector(): Record<
    string,
    number
  > {
    return this.acknowledgedVersionVector.toJSON();
  }

  getText(): string {
    return this.rga.getText();
  }

  serialize() {
  return this.rga.serialize();
}

restore(state: ReturnType<RGA["serialize"]>): void {
  this.rga.restore(state);
}
}