import { VersionVector } from "./version-vector";
import type { Operation } from "./type";

export function getMissingOperations(
  localVector: VersionVector,
  operations: Operation[]
): Operation[] {
  return operations.filter((operation) => {
    
    const clientId = operation.id.clientId;
    const sequence = operation.id.sequence;

    return sequence > localVector.get(clientId);
  });
}