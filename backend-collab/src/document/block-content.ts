import { RGA } from "../crdt/rga";
import type {
  Element,
  ElementId,
  Operation,
} from "../crdt/type";
import type { RGAState } from "../crdt/rga";

export class BlockContent {
  private readonly rga: RGA;

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

  applyOperations(
    operations: Operation[],
  ): void {
    for (const operation of operations) {
      this.applyOperation(operation);
    }
  }

  getText(): string {
    return this.rga.getText();
  }

  /**
   * Returns the current RGA elements.
   *
   * This is needed by the editor to translate a
   * cursor position into a CRDT ElementId.
   */
  getElements(): Element[] {
    return this.rga.getElements();
  }

  serialize(): RGAState {
    return this.rga.serialize();
  }

  restore(state: RGAState): void {
    this.rga.restore(state);
  }
}