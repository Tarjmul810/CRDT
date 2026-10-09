import { describe, expect, it } from "vitest";
import { VersionVector } from "../src/crdt/version-vector";
import { getMissingOperations } from "../src/crdt/sync";

describe("Sync", () => {
  it("finds operations a client is missing", () => {
    const local = new VersionVector();

    local.update("alice", 3);
    local.update("bob", 2);

    const operations = [
      {
        type: "insert" as const,
        id: {
          clientId: "bob",
          sequence: 3,
        },
        element: {
          id: {
            clientId: "bob",
            sequence: 3,
          },
          value: "X",
          after: null,
          deleted: false,
        },
      },
    ];

    const missing = getMissingOperations(
      local,
      operations
    );

    expect(missing).toHaveLength(1);
  });
});