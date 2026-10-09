import { describe, expect, it } from "vitest";
import { VersionVector } from "../src/crdt/version-vector";

describe("VersionVector", () => {
  it("starts clients at version 0", () => {
    const vector = new VersionVector();

    expect(vector.get("alice")).toBe(0);
  });

  it("increments a client's version", () => {
    const vector = new VersionVector();

    vector.increment("alice");

    expect(vector.get("alice")).toBe(1);

    vector.increment("alice");

    expect(vector.get("alice")).toBe(2);
  });
});

it("tracks multiple clients independently", () => {
  const vector = new VersionVector();

  vector.increment("alice");
  vector.increment("alice");

  vector.increment("bob");

  expect(vector.get("alice")).toBe(2);
  expect(vector.get("bob")).toBe(1);
});

it("can determine whether one version is behind another", () => {
  const alice = new VersionVector();
  const bob = new VersionVector();

  alice.update("alice", 5);
  alice.update("bob", 3);

  bob.update("alice", 5);
  bob.update("bob", 7);

  expect(alice.lessThanOrEqual(bob)).toBe(true);
});