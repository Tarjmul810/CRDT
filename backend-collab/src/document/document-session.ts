import { DocumentState } from "./document-state";
import type { ElementId, Element } from "../crdt/type";
import type { DocumentOperation } from "./operations";
import type { DocumentStateSnapshot } from "./document-state-snapshot";
import type { Block } from "./types";

type DocumentListener = () => void;

export class DocumentSession {
  readonly state: DocumentState;

  private readonly clientId: string;

  private readonly listeners =
    new Set<DocumentListener>();

  private version = 0;

  constructor(clientId: string) {
    this.clientId = clientId;
    this.state = new DocumentState(clientId);
  }

  getClientId(): string {
    return this.clientId;
  }

  /**
   * Monotonically increasing value used by React
   * to determine whether the document changed.
   */
  getVersion(): number {
    return this.version;
  }

  applyOperation(operation: DocumentOperation): void {
    this.state.applyDocumentOperation(operation);
    this.notifyListeners();
  }

  subscribe(listener: DocumentListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.version += 1;

    for (const listener of this.listeners) {
      listener();
    }
  }

  insertBlock(
    block: Block,
    after: ElementId | null,
  ): DocumentOperation {
    const operation = this.state.insertBlock(block, after);

    this.notifyListeners();

    return operation;
  }

  deleteBlock(blockId: string): DocumentOperation {
    const operation = this.state.deleteBlock(blockId);

    this.notifyListeners();

    return operation;
  }

  insertText(
    blockId: string,
    value: string,
    after: ElementId | null,
  ): DocumentOperation {
    const operation = this.state.insertText(
      blockId,
      value,
      after,
    );

    this.notifyListeners();

    return operation;
  }

  deleteText(
    blockId: string,
    target: ElementId,
  ): DocumentOperation {
    const operation = this.state.deleteText(
      blockId,
      target,
    );

    this.notifyListeners();

    return operation;
  }

  serialize(): DocumentStateSnapshot {
    return this.state.serialize();
  }

  restore(snapshot: DocumentStateSnapshot): void {
    this.state.restore(snapshot);
    this.notifyListeners();
  }

  getText(blockId: string): string {
    return this.state.getText(blockId);
  }

  getBlocks(): Block[] {
    return this.state.getBlocks();
  }

  getTextElements(blockId: string): Element[] {
  return this.state.getTextElements(blockId);
}
}