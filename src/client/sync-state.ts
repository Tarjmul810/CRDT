import { RGA } from "../crdt/rga";
import type { ElementId, Operation, DeleteOperation } from "../crdt/type";

export class SyncState {
  private readonly rga: RGA;

  constructor(clientId: string) {
    this.rga = new RGA(clientId);
  }

  insert(value: string, after: ElementId | null): Operation {
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

  getVersionVector(): Record<string, number> {
    return this.rga.serialize().versionVector;
  }

  getText(): string {
    return this.rga.getText();
  }
}