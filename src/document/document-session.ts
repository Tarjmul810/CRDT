import { DocumentState } from "./document-state";
import type { DocumentOperation } from "./operations";
import type { DocumentStateSnapshot } from "./document-state-snapshot";

export class DocumentSession {
  readonly state: DocumentState;

  constructor(clientId: string) {
    this.state = new DocumentState(clientId);
  }

  applyOperation(operation: DocumentOperation): void {
    this.state.applyDocumentOperation(operation);
  }

  serialize(): DocumentStateSnapshot {
    return this.state.serialize();
  }

  restore(snapshot: DocumentStateSnapshot): void {
    this.state.restore(snapshot);
  }
}