import { describe, expect, it } from "vitest";
import { RGA } from "../src/crdt/rga";

const insertOperation = (id: string, value: string, after: string | null) => ({
  type: "insert" as const,
  id,
  element: { id, value, after, deleted: false },
});

describe("RGA", () => {
  it("can insert text", () => {
    const alice = new RGA("alice");

    alice.insert("H", null);

    expect(alice.getText()).toBe("H");
  });
});

it("can insert multiple elements", () => {
  const alice = new RGA("alice");

  const h = alice.insert("H", null);
  const e = alice.insert("E", h.element.id);
  alice.insert("L", e.element.id);

  expect(alice.getText()).toBe("HEL");
});

it("converges when two clients insert after the same element", () => {
  const alice = new RGA("alice");
  const bob = new RGA("bob");

  const a = alice.insert("A", null);

  // Bob needs to know about A.
  bob.apply(a);

  // Both clients independently insert after A.
  const x = alice.insert("X", a.element.id);

  const y = bob.insert("Y", a.element.id);

  // Exchange operations.
  bob.apply(x);

  alice.apply(y);

  expect(alice.getText()).toBe(bob.getText());
});

it("converges regardless of operation delivery order", () => {
  const alice = new RGA("alice");
  const bob = new RGA("bob");

  const root = alice.insert("A", null);

  bob.apply(root);

  const x = alice.insert("X", root.element.id);
  const y = bob.insert("Y", root.element.id);

  // Alice receives Y.
  alice.apply(y);

  // Bob receives X.
  bob.apply(x);

  expect(alice.getText()).toBe(bob.getText());
});

it("uses deterministic ordering for concurrent inserts", () => {
  const alice = new RGA("alice");
  const bob = new RGA("bob");

  // Both clients start with A.
  const a = alice.insert("A", null);

  bob.apply(a);

  // Concurrent inserts.
  const x = alice.insert("X", a.element.id);
  const y = bob.insert("Y", a.element.id);

  // Alice receives Y.
  alice.apply(y);

  // Bob receives X.
  bob.apply(x);

  expect(alice.getText()).toBe("AXY");
  expect(bob.getText()).toBe("AXY");
});

it("converges when operations arrive in opposite orders", () => {
  const alice = new RGA("alice");
  const bob = new RGA("bob");

  const a = alice.insert("A", null);

  const operationA = a;

  bob.apply(operationA);

  const x = alice.insert("X", a.element.id);
  const y = bob.insert("Y", a.element.id);

  const operationX = x;
  const operationY = y;

  // Alice receives Y first.
  alice.apply(operationY);

  // Bob receives X first.
  bob.apply(operationX);

  expect(alice.getText()).toBe("AXY");
  expect(bob.getText()).toBe("AXY");
});

it("ignores duplicate insert operations", () => {
  const alice = new RGA("alice");

  const x = alice.insert("X", null);

  const operation = x;

  alice.apply(operation);
  alice.apply(operation);

  expect(alice.getText()).toBe("X");
});

it("keeps deleted elements as tombstones", () => {
  const alice = new RGA("alice");

  const a = alice.insert("A", null);
  const b = alice.insert("B", a.element.id);
  alice.insert("C", b.element.id);

  alice.delete(b.element.id);

  expect(alice.getText()).toBe("AC");
});

it("handles an insert that arrives before its dependency", () => {
  const alice = new RGA("alice");
  const bob = new RGA("bob");

  const a = alice.insert("A", null);

  bob.apply(a)

  const x = alice.insert("X", a.element.id);

  const y = alice.insert("Y", x.element.id);

  const operationX = x;
  const operationY = y;

  // DELIBERATELY WRONG ORDER.
  bob.apply(operationY);
  bob.apply(operationX);

  expect(bob.getText()).toBe("AXY");
});

it("handles delete arriving before the element", () => {
  const alice = new RGA("alice");
  const bob = new RGA("bob");

  const a = alice.insert("A", null);

  bob.apply(a);

  const b = alice.insert("B", a.element.id);

  // Bob receives DELETE before INSERT.
  bob.apply({
    type: "delete",
    id: b.element.id,
    target: b.element.id,
  });

  bob.apply(b);

  expect(bob.getText()).toBe("A");
});