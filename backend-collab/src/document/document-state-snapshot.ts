
import type { RGAState } from "../crdt/rga";
import type { BlockListState } from "./block-list";

export type BlockContentSnapshot = {
  blockId: string;
  state: RGAState;
};

export type DocumentStateSnapshot = {
  blockList: BlockListState;
  contents: BlockContentSnapshot[];
};
