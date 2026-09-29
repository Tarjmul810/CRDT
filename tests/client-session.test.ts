import {
  describe,
  expect,
  it,
} from "vitest";

import { ClientSession } from "../src/server/client-session";

import {
  createInsertOperation,
} from "./helpers/operations";
import { randomUUID } from "crypto";

describe("ClientSession", () => {
  it("generates a unique client ID", () => {
    const firstSession = new ClientSession(randomUUID());
    const secondSession = new ClientSession(randomUUID());

    expect(firstSession.clientId).toBeTypeOf("string");
    expect(secondSession.clientId).toBeTypeOf("string");

    expect(firstSession.clientId).not.toBe(
      secondSession.clientId
    );
  });

  it("accepts an operation with its own client ID", () => {
    const session = new ClientSession(randomUUID());

    const operation = createInsertOperation(
      session.clientId,
      1
    );

    expect(
      session.validateOperationIdentity(operation)
    ).toBe(true);
  });

  it("rejects an operation belonging to another client", () => {
    const session = new ClientSession(randomUUID());

    const operation = createInsertOperation(
      "another-client",
      1
    );

    expect(
      session.validateOperationIdentity(operation)
    ).toBe(false);
  });

  it("rejects a repeated sequence number", () => {
    const session = new ClientSession(randomUUID());

    const firstOperation = createInsertOperation(
      session.clientId,
      1
    );

    const repeatedOperation = createInsertOperation(
      session.clientId,
      1
    );

    expect(
      session.validateOperationIdentity(firstOperation)
    ).toBe(true);

    expect(
      session.validateOperationIdentity(repeatedOperation)
    ).toBe(false);
  });

  it("rejects an older sequence number", () => {
    const session = new ClientSession(randomUUID());

    const firstOperation = createInsertOperation(
      session.clientId,
      3
    );

    const olderOperation = createInsertOperation(
      session.clientId,
      2
    );

    expect(
      session.validateOperationIdentity(firstOperation)
    ).toBe(true);

    expect(
      session.validateOperationIdentity(olderOperation)
    ).toBe(false);
  });

  it("rejects zero and negative sequences", () => {
    const session = new ClientSession(randomUUID());

    const zeroOperation = createInsertOperation(
      session.clientId,
      0
    );

    const negativeOperation = createInsertOperation(
      session.clientId,
      -1
    );

    expect(
      session.validateOperationIdentity(zeroOperation)
    ).toBe(false);

    expect(
      session.validateOperationIdentity(negativeOperation)
    ).toBe(false);
  });

  it("updates the last accepted sequence", () => {
    const session = new ClientSession(randomUUID());

    const firstOperation = createInsertOperation(
      session.clientId,
      1
    );

    const secondOperation = createInsertOperation(
      session.clientId,
      2
    );

    session.validateOperationIdentity(firstOperation);
    session.validateOperationIdentity(secondOperation);

    expect(session.getLastSequence()).toBe(2);
  });
});