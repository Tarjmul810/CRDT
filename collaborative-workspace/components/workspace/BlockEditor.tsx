"use client";

import {
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import type {
  Block,
  ElementId,
} from "backend-collab/shared";

import { useDocumentSessionContext } from "@/lib/collaboration/document-session-provider";
import { useDocumentSession } from "@/lib/collaboration/use-document-session";
import { useDocumentCursors } from "@/lib/collaboration/use-document-cursors";

import BlockRow from "./BlockRow";

export default function BlockEditor() {
  const {
    session: contextSession,
    syncClient,
  } = useDocumentSessionContext();

  const remoteCursors = useDocumentCursors(syncClient);

  const session =
    useDocumentSession(contextSession);

  const blocks = session.getBlocks();

  const inputRefs = useRef<
    Record<string, HTMLInputElement | null>
  >({});

  function addBlockAfter(blockId: string) {
    const currentBlocks =
      session.getBlocks();

    const index = currentBlocks.findIndex(
      (block) => block.id === blockId,
    );

    if (index === -1) {
      return;
    }

    const blockAfter =
      currentBlocks[index];

    const elementId =
      session.state.blocks.getElementId(
        blockAfter.id,
      );

    if (!elementId) {
      return;
    }

    const newBlock: Block = {
      id: crypto.randomUUID(),
      type: "paragraph",
    };

    const operation =
      session.insertBlock(
        newBlock,
        elementId,
      );

    syncClient.sendLocalOperation(
      operation,
    );

    requestAnimationFrame(() => {
      inputRefs.current[
        newBlock.id
      ]?.focus();
    });
  }

  function deleteBlock(blockId: string) {
    const currentBlocks =
      session.getBlocks();

    if (currentBlocks.length <= 1) {
      return;
    }

    const index = currentBlocks.findIndex(
      (block) => block.id === blockId,
    );

    if (index === -1) {
      return;
    }

    const focusBlock =
      currentBlocks[index - 1] ??
      currentBlocks[index + 1];

    const operation =
      session.deleteBlock(blockId);

    syncClient.sendLocalOperation(
      operation,
    );

    requestAnimationFrame(() => {
      if (focusBlock) {
        inputRefs.current[
          focusBlock.id
        ]?.focus();
      }
    });
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    block: Block,
  ) {
    if (event.key === "Enter") {
      event.preventDefault();

      addBlockAfter(block.id);

      return;
    }

    if (
      event.key === "Backspace" &&
      event.currentTarget.selectionStart === 0 &&
      session.getText(block.id).length === 0
    ) {
      event.preventDefault();

      deleteBlock(block.id);

      return;
    }
  }

  function handleChange(
    event: ChangeEvent<HTMLInputElement>,
    block: Block,
  ) {
    const input = event.currentTarget;
    const newValue = input.value;
    const oldValue = session.getText(
      block.id,
    );

    if (newValue === oldValue) {
      return;
    }

    const elements = session
      .getTextElements(block.id)
      .filter((element) => !element.deleted);

    let start = 0;

    while (
      start < oldValue.length &&
      start < newValue.length &&
      oldValue[start] === newValue[start]
    ) {
      start++;
    }

    let oldEnd =
      oldValue.length - 1;

    let newEnd =
      newValue.length - 1;

    while (
      oldEnd >= start &&
      newEnd >= start &&
      oldValue[oldEnd] ===
      newValue[newEnd]
    ) {
      oldEnd--;
      newEnd--;
    }

    const deletedCount =
      oldEnd >= start
        ? oldEnd - start + 1
        : 0;

    const insertedText =
      newEnd >= start
        ? newValue.slice(
          start,
          newEnd + 1,
        )
        : "";

    const anchorElement =
      elements[start - 1];

    let after: ElementId | null =
      anchorElement?.id ?? null;

    for (
      let i = 0;
      i < deletedCount;
      i++
    ) {
      const target =
        elements[start + i];

      if (!target) {
        break;
      }

      const operation =
        session.deleteText(
          block.id,
          target.id,
        );

      syncClient.sendLocalOperation(
        operation,
      );
    }

    for (const character of insertedText) {
      const operation =
        session.insertText(
          block.id,
          character,
          after,
        );

      syncClient.sendLocalOperation(
        operation,
      );

      after = operation.id;
    }

    const cursorPosition =
      input.selectionStart ??
      newValue.length;

    requestAnimationFrame(() => {
      const element =
        inputRefs.current[block.id];

      if (!element) {
        return;
      }

      element.focus();

      element.setSelectionRange(
        cursorPosition,
        cursorPosition,
      )
      syncClient.sendCursorUpdate(block.id, cursorPosition);
    });
  }


  function handleChangeType(
    blockId: string,
    type: Block["type"],
  ) {
    const currentBlock = session
      .getBlocks()
      .find((block) => block.id === blockId);

    console.log(
      "[BlockEditor] blocks being rendered:",
      blocks.map((block) => ({
        id: block.id,
        type: block.type,
      })),
    );

    if (!currentBlock || currentBlock.type === type) {
      return;
    }

    const operation = session.updateBlockType(blockId, type);

    syncClient.sendLocalOperation(operation);
  }

  function handleCursorChange(block: Block, offset: number) {
    syncClient.sendCursorUpdate(block.id, offset);
  }

  function addLastBlock() {
    const lastBlock =
      blocks[blocks.length - 1];

    if (!lastBlock) {
      const newBlock: Block = {
        id: crypto.randomUUID(),
        type: "paragraph",
      };

      const operation =
        session.insertBlock(
          newBlock,
          null,
        );

      syncClient.sendLocalOperation(
        operation,
      );

      requestAnimationFrame(() => {
        inputRefs.current[
          newBlock.id
        ]?.focus();
      });

      return;
    }

    addBlockAfter(lastBlock.id);
  }

  return (
    <div className="space-y-1">
      {blocks.map((block) => (
        <BlockRow
          key={block.id}
          block={block}
          value={session.getText(block.id)}
          inputRef={(element) => {
            inputRefs.current[block.id] =
              element;
          }}
          onChangeAction={handleChange}
          onChangeTypeAction={handleChangeType}
          onKeyDownAction={handleKeyDown}
          onCursorChangeAction={handleCursorChange}
          remoteCursors={remoteCursors.filter(
            (cursor) => cursor.blockId === block.id,
          )}
        />
      ))}

      <button
        type="button"
        onClick={addLastBlock}
        className="mt-6 flex items-center gap-2 text-sm text-zinc-600 transition hover:text-zinc-300"
      >
        <span className="text-base">
          +
        </span>

        <span>Add a block</span>
      </button>
    </div>
  );
}