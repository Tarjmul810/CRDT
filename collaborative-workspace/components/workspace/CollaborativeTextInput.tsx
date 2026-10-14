"use client";

import {
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
    type ChangeEvent,
    type KeyboardEvent,
    type Ref,
} from "react";
import type { Block } from "backend-collab/shared";
import type { RemoteCursor } from "@/lib/collaboration/document-sync-client";

type CollaborativeTextInputProps = {
    block: Block;
    value: string;
    placeholder: string;
    className: string;
    inputRef?: Ref<HTMLInputElement>;
    onChangeAction: (
        event: ChangeEvent<HTMLInputElement>,
        block: Block,
    ) => void;
    onKeyDownAction: (
        event: KeyboardEvent<HTMLInputElement>,
        block: Block,
    ) => void;
    onCursorChangeAction: (block: Block, offset: number) => void;
    remoteCursors: RemoteCursor[];
};

type PositionedCursor = {
    clientId: string;
    left: number;
    top: number;
    height: number;
};

function getCursorColor(clientId: string): string {
    const colors = [
        "#f87171",
        "#60a5fa",
        "#34d399",
        "#fbbf24",
        "#c084fc",
        "#fb7185",
    ];

    let hash = 0;

    for (let i = 0; i < clientId.length; i++) {
        hash = (hash * 31 + clientId.charCodeAt(i)) >>> 0;
    }

    return colors[hash % colors.length];
}

export default function CollaborativeTextInput({
    block,
    value,
    placeholder,
    className,
    inputRef,
    onChangeAction,
    onKeyDownAction,
    onCursorChangeAction,
    remoteCursors,
}: CollaborativeTextInputProps) {
    const localInputRef = useRef<HTMLInputElement | null>(null);
    const [positionedCursors, setPositionedCursors] = useState <PositionedCursor[]>([]);

    const setInputRef = useCallback(
        (element: HTMLInputElement | null) => {
            localInputRef.current = element;

            if (typeof inputRef === "function") {
                inputRef(element);
            } else if (inputRef) {
                inputRef.current = element;
            }
        },
        [inputRef],

    );
    const measureCursors = useCallback(() => {
        const input = localInputRef.current;

        if (!input || remoteCursors.length === 0) {
            setPositionedCursors([]);
            return;
        }

        const computed = window.getComputedStyle(input);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
            setPositionedCursors([]);
            return;
        }

        context.font = computed.font;

        const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0;
        const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
        const lineHeight = Number.parseFloat(computed.lineHeight);
        const fontSize = Number.parseFloat(computed.fontSize) || 16;
        const caretHeight = Number.isFinite(lineHeight)
            ? lineHeight
            : fontSize * 1.4;

        const letterSpacing =
            computed.letterSpacing === "normal"
                ? 0
                : Number.parseFloat(computed.letterSpacing) || 0;

        const nextPositions = remoteCursors.map((cursor) => {
            const offset = Math.max(0, Math.min(cursor.offset, value.length));
            const textBeforeCursor = value.slice(0, offset);

            const measuredWidth =
                context.measureText(textBeforeCursor).width +
                Math.max(0, textBeforeCursor.length - 1) * letterSpacing;

            return {
                clientId: cursor.clientId,
                left: paddingLeft + measuredWidth - input.scrollLeft,
                top: paddingTop,
                height: caretHeight,
            };
        });

        setPositionedCursors(nextPositions);

    }, [remoteCursors, value]);

    useLayoutEffect(() => {
        measureCursors();
    }, [measureCursors]);

    function reportCursor(input: HTMLInputElement) {
        onCursorChangeAction(
            block,
            input.selectionStart ?? input.value.length,
        );
    }

    return (
        <div className="relative min-w-0 flex-1">
            <input
                ref={setInputRef}
                value={value}
                placeholder={placeholder}
                className={className}
                onChange={(event) => onChangeAction(event, block)}
                onKeyDown={(event) => onKeyDownAction(event, block)}
                onClick={(event) => reportCursor(event.currentTarget)}
                onKeyUp={(event) => reportCursor(event.currentTarget)}
                onSelect={(event) => reportCursor(event.currentTarget)}
                onScroll={measureCursors}
            />

            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 overflow-hidden"
            >
                {positionedCursors.map((cursor) => {
                    const color = getCursorColor(cursor.clientId);

                    return (
                        <div
                            key={cursor.clientId}
                            className="absolute"
                            style={{
                                left: cursor.left,
                                top: cursor.top,
                                height: cursor.height,
                            }}
                        >
                            <div
                                className="absolute left-0 w-0.5 rounded-full"
                                style={{
                                    top: 0,
                                    height: cursor.height,
                                    backgroundColor: color,
                                }}
                            />

                            <span
                                className="absolute bottom-full left-0 mb-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] leading-3 text-white"
                                style={{ backgroundColor: color }}
                            >
                                {cursor.clientId.slice(0, 8)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>

    );
}