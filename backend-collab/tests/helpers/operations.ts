import type { InsertOperation } from "../../src/crdt/type";

export function createInsertOperation(
  clientId: string,
  sequence: number,
  value = "A"
): InsertOperation {
  return {
    type: "insert",

    id: {
      clientId,
      sequence,
    },

    element: {
      id: {
        clientId,
        sequence,
      },

      value,
      after: null,
      deleted: false,
    },
  };
}