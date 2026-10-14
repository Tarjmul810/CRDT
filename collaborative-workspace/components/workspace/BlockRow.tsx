"use client";

import {
  useState,
  type ChangeEvent,
  type KeyboardEvent,
type Ref,
} from "react";

import type {
Block,
BlockType,
} from "backend-collab/shared";

import type { RemoteCursor } from "@/lib/collaboration/document-sync-client";
import CollaborativeTextInput from "./CollaborativeTextInput";

const blockTypes: {
type: BlockType;
label: string;
description: string;
}[] = [
{
type: "paragraph",
label: "Text",
description: "Plain text",
},
{
type: "heading",
label: "Heading",
description: "Large heading",
},
{
type: "todo",
label: "To-do",
description: "Task with checkbox",
},
];

type BlockRowProps = {
block: Block;
value: string;
inputRef: Ref<HTMLInputElement>;
onChangeAction: (
event: ChangeEvent<HTMLInputElement>,
block: Block,
) => void;
onChangeTypeAction: (
blockId: string,
type: BlockType,
) => void;
onKeyDownAction: (
event: KeyboardEvent<HTMLInputElement>,
block: Block,
) => void;
onCursorChangeAction: (
block: Block,
offset: number,
) => void;
remoteCursors: RemoteCursor[];
};

export default function BlockRow({
block,
value,
inputRef,
onChangeAction,
onChangeTypeAction,
onKeyDownAction,
onCursorChangeAction,
remoteCursors,
}: BlockRowProps) {
const inputProps = {
block,
value,
inputRef,
onChangeAction,
onKeyDownAction,
onCursorChangeAction,
remoteCursors,
};

return (
<div className="group relative flex items-start">
<BlockMenu
     block={block}
     onChangeType={onChangeTypeAction}
   />

  <div className="min-w-0 flex-1">
    {block.type === "heading" && (
      <CollaborativeTextInput
        {...inputProps}
        placeholder="Heading"
        className="w-full bg-transparent text-3xl font-semibold tracking-tight text-zinc-100 outline-none placeholder:text-zinc-700"
      />
    )}

    {block.type === "paragraph" && (
      <CollaborativeTextInput
        {...inputProps}
        placeholder="Type something..."
        className="w-full bg-transparent text-base leading-7 text-zinc-300 outline-none placeholder:text-zinc-700"
      />
    )}

    {block.type === "todo" && (
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          disabled
          className="mt-1.5 h-4 w-4 accent-zinc-300"
        />

        <CollaborativeTextInput
          {...inputProps}
          placeholder="To-do"
          className="w-full min-w-0 bg-transparent text-base text-zinc-300 outline-none placeholder:text-zinc-700"
        />
      </div>
    )}
  </div>
</div>

);
}

type BlockMenuProps = {
block: Block;
onChangeType: (
blockId: string,
type: BlockType,
) => void;
};

function BlockMenu({
block,
onChangeType,
}: BlockMenuProps) {
const [isOpen, setIsOpen] = useState(false);

console.log("[BlockRow] render:", {
  blockId: block.id,
  type: block.type,
});

return (
<div className="relative z-20 mr-2 w-6 shrink-0">
<button
type="button"
className="mt-1 flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition hover hover focus-visible focus-visible focus-visible"
aria-label="Change block type"
aria-expanded={isOpen}
onClick={() => setIsOpen((open) => !open)}
>
⋮⋮
</button>

  {isOpen && (
    <div className="absolute left-0 top-8 z-50 w-44 rounded-lg border border-zinc-800 bg-zinc-950 p-1 shadow-xl">
      {blockTypes.map((item) => (
        <button
          key={item.type}
          type="button"
          className={`flex w-full flex-col rounded-md px-3 py-2 text-left transition hover:bg-zinc-800 ${
            block.type === item.type
              ? "bg-zinc-900 text-zinc-100"
              : "text-zinc-300"
          }`}
          onClick={() => {
            onChangeType(block.id, item.type);
            setIsOpen(false);
          }}
        >
          <span className="text-sm">{item.label}</span>
          <span className="text-xs text-zinc-500">
            {item.description}
          </span>
        </button>
      ))}
    </div>
  )}
</div>

);
}