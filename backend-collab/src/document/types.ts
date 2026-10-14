export type BlockType =
  | "paragraph"
  | "heading"
  | "todo";

export type BlockId = string;

export type Block = {
  id: BlockId;
  type: BlockType;
  content?: string;
  checked? : boolean;
};

export type Document = {
  id: string;
  blocks: Block[];
};

