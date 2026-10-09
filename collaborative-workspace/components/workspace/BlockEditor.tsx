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

export default function BlockEditor() {
  const { session, syncClient } =
    useDocumentSessionContext();

  const documentSession =
    useDocumentSession(session);

  const blocks =
    documentSession.getBlocks();

  /**
   * Keep references to the actual input elements.
   *
   * We use these to restore the cursor after React
   * updates the controlled input value.
   */
  const inputRefs =
    useRef<Record<string, HTMLInputElement | null>>(
      {},
    );

  /**
   * Restore the cursor without using useEffect.
   */
  function restoreCursor(
    blockId: string,
    position: number,
  ) {
    requestAnimationFrame(() => {
      const input =
        inputRefs.current[blockId];

      if (!input) {
        return;
      }

      input.focus();

      input.setSelectionRange(
        position,
        position,
      );
    });
  }

  /**
   * Add a new paragraph block after the
   * current last block.
   */
  function addBlock() {
    const currentBlocks =
      documentSession.getBlocks();

    const newBlock: Block = {
      id: crypto.randomUUID(),
      type: "paragraph",
    };

    let after: ElementId | null = null;

    /**
     * Empty document:
     *
     * Insert at the beginning of the block RGA.
     */
    if (currentBlocks.length === 0) {
      after = null;
    } else {
      /**
       * Non-empty document:
       *
       * Insert after the last visible block.
       */
      const lastBlock =
        currentBlocks[
          currentBlocks.length - 1
        ];

      const lastElement =
        documentSession.state.blocks.getElementId(
          lastBlock.id,
        );

      if (!lastElement) {
        console.error(
          "Could not find RGA element for last block",
          lastBlock.id,
        );

        return;
      }

      after = lastElement;
    }

    console.log("CREATING BLOCK", {
      block: newBlock,
      after,
    });

    const operation =
      documentSession.insertBlock(
        newBlock,
        after,
      );

    console.log(
      "INSERT BLOCK OPERATION",
      operation,
    );

    syncClient.sendLocalOperation(
      operation,
    );
  }

  /**
   * Delete an entire block.
   */
  function deleteBlock(block: Block) {
    console.log(
      "DELETING BLOCK",
      block.id,
    );

    const operation =
      documentSession.deleteBlock(
        block.id,
      );

    console.log(
      "DELETE BLOCK OPERATION",
      operation,
    );

    syncClient.sendLocalOperation(
      operation,
    );
  }

  /**
   * Handle text changes.
   *
   * Instead of assuming that text was only appended,
   * we compare the previous CRDT text with the new
   * DOM value and determine:
   *
   *   - common prefix
   *   - deleted range
   *   - inserted range
   *   - common suffix
   *
   * This allows editing in the middle of the text.
   */
  function handleTextChange(
    event: ChangeEvent<HTMLInputElement>,
    block: Block,
  ) {
    const input =
      event.currentTarget;

    const newValue =
      input.value;

    const oldValue =
      documentSession.getText(
        block.id,
      );

    const selectionStart =
      input.selectionStart ?? newValue.length;

    const selectionEnd =
      input.selectionEnd ?? selectionStart;

    console.log("TEXT CHANGE", {
      blockId: block.id,
      oldValue,
      newValue,
      selectionStart,
      selectionEnd,
    });

    /**
     * Nothing changed.
     */
    if (oldValue === newValue) {
      return;
    }

    /**
     * Find the longest common prefix.
     *
     * Example:
     *
     * old: "hello"
     * new: "heXllo"
     *
     * prefix = "he"
     */
    let prefixLength = 0;

    while (
      prefixLength < oldValue.length &&
      prefixLength < newValue.length &&
      oldValue[prefixLength] ===
        newValue[prefixLength]
    ) {
      prefixLength++;
    }

    /**
     * Find the longest common suffix.
     *
     * We don't let it overlap the changed prefix.
     */
    let suffixLength = 0;

    while (
      suffixLength <
        oldValue.length - prefixLength &&
      suffixLength <
        newValue.length - prefixLength &&
      oldValue[
        oldValue.length - 1 - suffixLength
      ] ===
        newValue[
          newValue.length - 1 - suffixLength
        ]
    ) {
      suffixLength++;
    }

    /**
     * The old text inside this range is being deleted.
     */
    const deletedLength =
      oldValue.length -
      prefixLength -
      suffixLength;

    /**
     * The new text inside this range is being inserted.
     */
    const insertedLength =
      newValue.length -
      prefixLength -
      suffixLength;

    const insertedText =
      newValue.slice(
        prefixLength,
        prefixLength + insertedLength,
      );

    console.log("TEXT DIFF", {
      prefixLength,
      suffixLength,
      deletedLength,
      insertedLength,
      insertedText,
    });

    /**
     * Get the currently visible CRDT elements.
     *
     * The order here corresponds to:
     *
     * oldValue[0]
     * oldValue[1]
     * oldValue[2]
     * ...
     */
    const elements =
      documentSession
        .getTextElements(block.id)
        .filter(
          (element) =>
            !element.deleted,
        );

    /**
     * --------------------------------------------------
     * DELETE OLD TEXT
     * --------------------------------------------------
     *
     * If:
     *
     * old = "hello"
     * new = "helo"
     *
     * prefix = 3 ("hel")
     * deleted range = old[3]
     *
     * We delete the corresponding CRDT element.
     */
    for (
      let index = 0;
      index < deletedLength;
      index++
    ) {
      const targetIndex =
        prefixLength;

      const target =
        elements[targetIndex];

      if (!target) {
        console.error(
          "Could not find CRDT element to delete",
          {
            blockId: block.id,
            targetIndex,
            elements,
          },
        );

        break;
      }

      const operation =
        documentSession.deleteText(
          block.id,
          target.id,
        );

      console.log(
        "DELETE TEXT OPERATION",
        operation,
      );

      syncClient.sendLocalOperation(
        operation,
      );

      /**
       * Do not increment targetIndex here.
       *
       * After deleting an element, the next
       * element shifts into the same visible
       * position.
       */
      elements.splice(
        targetIndex,
        1,
      );
    }

    /**
     * --------------------------------------------------
     * INSERT NEW TEXT
     * --------------------------------------------------
     *
     * The insertion point is immediately after
     * the character before the changed region.
     *
     * Example:
     *
     * old = "hello"
     * inserting "X" after "he":
     *
     *      h e | l l o
     *          ↑
     *        after = e
     */
    let after: ElementId | null =
      null;

    if (prefixLength > 0) {
      const previousElement =
        elements[prefixLength - 1];

      if (previousElement) {
        after =
          previousElement.id;
      }
    }

    /**
     * Insert each character separately because
     * your current BlockContent/RGA operates
     * on individual inserted values.
     */
    for (
      const character of insertedText
    ) {
      const operation =
        documentSession.insertText(
          block.id,
          character,
          after,
        );

      console.log(
        "INSERT TEXT OPERATION",
        operation,
      );

      syncClient.sendLocalOperation(
        operation,
      );

      /**
       * The next character must be inserted
       * after the character we just created.
       */
      after = operation.id;
    }

    /**
     * --------------------------------------------------
     * RESTORE CURSOR
     * --------------------------------------------------
     *
     * For a normal edit, the cursor should end
     * immediately after the inserted text.
     *
     * Example:
     *
     * hello
     *   ↑
     *
     * type X
     *
     * heXllo
     *    ↑
     */
    const newCursorPosition =
      prefixLength +
      insertedLength;

    restoreCursor(
      block.id,
      newCursorPosition,
    );
  }

  /**
   * Handle keyboard-specific block behavior.
   *
   * Normal text deletion is handled through
   * handleTextChange().
   *
   * This handler is mainly for deleting an
   * empty block.
   */
  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    block: Block,
  ) {
    if (event.key !== "Backspace") {
      return;
    }

    const input =
      event.currentTarget;

    const cursorPosition =
      input.selectionStart ?? 0;

    const selectionEnd =
      input.selectionEnd ?? cursorPosition;

    /**
     * If there is selected text, let the normal
     * input change handler process the deletion.
     */
    if (
      cursorPosition !== selectionEnd
    ) {
      return;
    }

    const text =
      documentSession.getText(
        block.id,
      );

    /**
     * Empty block + Backspace
     * → delete entire block.
     */
    if (
      text.length === 0 &&
      cursorPosition === 0
    ) {
      event.preventDefault();

      deleteBlock(block);
    }
  }

  return (
    <div className="space-y-4">
      {blocks.map((block) => {
        const text =
          documentSession.getText(
            block.id,
          );

        return (
          <div
            key={block.id}
            className="flex items-center gap-3"
          >
            <span className="w-20 shrink-0 text-xs text-zinc-600">
              {block.type}
            </span>

            <input
              ref={(element) => {
                inputRefs.current[
                  block.id
                ] = element;
              }}
              value={text}
              onChange={(event) =>
                handleTextChange(
                  event,
                  block,
                )
              }
              onKeyDown={(event) =>
                handleKeyDown(
                  event,
                  block,
                )
              }
              placeholder="Type here..."
              className="w-full bg-transparent text-zinc-200 outline-none placeholder:text-zinc-700"
            />

            <button
              type="button"
              onClick={() =>
                deleteBlock(block)
              }
              className="shrink-0 text-xs text-zinc-700 hover:text-red-400"
            >
              Delete
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addBlock}
        className="rounded border border-zinc-800 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
      >
        + Add block
      </button>
    </div>
  );
}