import type { RGAState } from "../crdt/rga";

export type BlockContentSnapshot = {
  blockId: string;
  state: RGAState;
};

export type DocumentStateSnapshot = {
  blockList: RGAState;
  contents: BlockContentSnapshot[];
};