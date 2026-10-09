import { describe, expect, it } from "vitest";
import type {
  Block,
  Document,
} from "../src/document/types";

describe("Document model", () => {
  it("represents a document containing blocks", () => {
    const document: Document = {
      id: "doc-1",
      blocks: [
        {
          id: "block-1",
          type: "heading",
        },
        {
          id: "block-2",
          type: "paragraph",
          content: "Hello world",
        },
      ],
    };

    

    expect(document.blocks).toHaveLength(2);
    expect(document.blocks[1].type).toBe("paragraph");
    expect(document.blocks[1].content).toBe(
      "Hello world"
    );
  });
});