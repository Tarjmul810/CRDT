import {
  describe,
  expect,
  it,
} from "vitest";

import { BlockContent } from "../src/document/block-content";

describe("BlockContent", () => {
  it("inserts text", () => {
    const content = new BlockContent("client-a");

    const first = content.insert("H", null);

    content.insert("i", first.id);

    expect(content.getText()).toBe("Hi");
  });

  it("deletes text", () => {
    const content = new BlockContent("client-a");

    const first = content.insert("H", null);

    content.insert("i", first.id);

    content.delete(first.id);

    expect(content.getText()).toBe("i");
  });

  it("applies remote operations", () => {
    const clientA = new BlockContent("client-a");
    const clientB = new BlockContent("client-b");

    const operation = clientA.insert("H", null);

    clientB.applyOperation(operation);

    expect(clientB.getText()).toBe("H");
  });

  it("converges on concurrent edits", () => {
    const clientA = new BlockContent("client-a");
    const clientB = new BlockContent("client-b");

    const first = clientA.insert("A", null);

    clientB.applyOperation(first);

    const operationA = clientA.insert(
      "B",
      first.id,
    );

    const operationB = clientB.insert(
      "C",
      first.id,
    );

    clientA.applyOperation(operationB);
    clientB.applyOperation(operationA);

    expect(clientA.getText()).toBe(
      clientB.getText(),
    );
  });
});