import { describe, expect, it } from "vitest";
import { validateMessage } from "../src/server/validator";

describe("validateMessage", () => {
  it("accepts a valid join message", () => {
    const message = {
      type: "join",
      documentId: "doc-123",
    };

    expect(validateMessage(message)).toBe(true);
  });

  it("accepts a valid insert operation", () => {
    const message = {
      type: "operation",
      operation: {
        type: "insert",
        id: {
          clientId: "alice",
          sequence: 1,
        },
        element: {
          id: {
            clientId: "alice",
            sequence: 1,
          },
          value: "H",
          after: null,
          deleted: false,
        },
      },
    };

    expect(validateMessage(message)).toBe(true);
  });

  it("accepts a valid delete operation", () => {
    const message = {
      type: "operation",
      operation: {
        type: "delete",
        id: {
          clientId: "alice",
          sequence: 2,
        },
        target: {
          clientId: "alice",
          sequence: 1,
        },
      },
    };

    expect(validateMessage(message)).toBe(true);
  });

  it("rejects an unknown message type", () => {
    const message = {
      type: "something-else",
      documentId: "doc-123",
    };

    expect(validateMessage(message)).toBe(false);
  });

  it("rejects a join message without documentId", () => {
    const message = {
      type: "join",
    };

    expect(validateMessage(message)).toBe(false);
  });

  it("rejects an operation with an invalid operation type", () => {
    const message = {
      type: "operation",
      operation: {
        type: "update",
      },
    };

    expect(validateMessage(message)).toBe(false);
  });

  it("rejects an operation without an id", () => {
    const message = {
      type: "operation",
      operation: {
        type: "insert",
        element: {
          id: {
            clientId: "alice",
            sequence: 1,
          },
          value: "H",
          after: null,
          deleted: false,
        },
      },
    };

    expect(validateMessage(message)).toBe(false);
  });

  it("rejects an id with an invalid sequence", () => {
    const message = {
      type: "operation",
      operation: {
        type: "insert",
        id: {
          clientId: "alice",
          sequence: "1",
        },
        element: {
          id: {
            clientId: "alice",
            sequence: 1,
          },
          value: "H",
          after: null,
          deleted: false,
        },
      },
    };

    expect(validateMessage(message)).toBe(false);
  });

  it("rejects an insert with mismatched element id", () => {
    const message = {
      type: "operation",
      operation: {
        type: "insert",
        id: {
          clientId: "alice",
          sequence: 1,
        },
        element: {
          id: {
            clientId: "bob",
            sequence: 5,
          },
          value: "H",
          after: null,
          deleted: false,
        },
      },
    };

    expect(validateMessage(message)).toBe(false);
  });

  it("rejects a delete with malformed target", () => {
    const message = {
      type: "operation",
      operation: {
        type: "delete",
        id: {
          clientId: "alice",
          sequence: 2,
        },
        target: {
          clientId: "alice",
          sequence: "1",
        },
      },
    };

    expect(validateMessage(message)).toBe(false);
  });
});