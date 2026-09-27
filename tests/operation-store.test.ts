import {
    describe,
    expect,
    it,
} from "vitest";

import { InMemoryOperationStore } from "../src/server/memory-operation-store";

describe("InMemoryOperationStore", () => {
    it("stores operations for a document", async () => {
        const store =
            new InMemoryOperationStore();

        const operation = {
            type: "insert" as const,
            id: {
                clientId: "client-1",
                sequence: 1,
            },
            element: {
                id: {
                    clientId: "client-1",
                    sequence: 1,
                },
                value: "A",
                after: null,
                deleted: false,
            },
        };

        const stored = await store.append(
            "doc-1",
            operation
        );

        expect(stored.version).toBe(1);
        expect(stored.operation).toEqual(operation);
    });

    it("keeps documents isolated", async () => {
        const store =
            new InMemoryOperationStore();

        const operation = {
            type: "insert" as const,
            id: {
                clientId: "client-1",
                sequence: 1,
            },
            element: {
                id: {
                    clientId: "client-1",
                    sequence: 1,
                },
                value: "A",
                after: null,
                deleted: false,
            },
        };

        const stored = await store.append(
            "doc-1",
            operation
        );

        expect(
            await store.getOperations("doc-1")
        ).toHaveLength(1);

        expect(
            await store.getOperations("doc-2")
        ).toHaveLength(0);


    });

    it("returns a copy of the operation list", async () => {
        const store =
            new InMemoryOperationStore();

        const operation = {
            type: "insert" as const,
            id: {
                clientId: "client-1",
                sequence: 1,
            },
            element: {
                id: {
                    clientId: "client-1",
                    sequence: 1,
                },
                value: "A",
                after: null,
                deleted: false,
            },
        };

        await store.append(
            "doc-1",
            operation
        );

        const operations =
            await store.getOperations("doc-1");

        operations.pop();

        expect(
            await store.getOperations("doc-1")
        ).toHaveLength(1);
    });

    it("returns only operations after a version", async () => {
        const store =
            new InMemoryOperationStore();

        const operation1 = {
            type: "insert" as const,
            id: {
                clientId: "client-1",
                sequence: 1,
            },
            element: {
                id: {
                    clientId: "client-1",
                    sequence: 1,
                },
                value: "A",
                after: null,
                deleted: false,
            },
        }
        const operation2 = {
            type: "insert" as const,
            id: {
                clientId: "client-1",
                sequence: 2,
            },
            element: {
                id: {
                    clientId: "client-1",
                    sequence: 2,
                },
                value: "B",
                after: {
                    clientId: "client-1",
                    sequence: 1,
                },
                deleted: false,
            },
        }
        const operation3 = {
            type: "insert" as const,
            id: {
                clientId: "client-1",
                sequence: 3,
            },
            element: {
                id: {
                    clientId: "client-1",
                    sequence: 3,
                },
                value: "C",
                after: {
                    clientId: "client-1",
                    sequence: 2,
                },
                deleted: false,
            },
        }

        await store.append("doc-1", operation1);
        await store.append("doc-1", operation2);
        await store.append("doc-1", operation3);

        const operations =
            await store.getOperations(
                "doc-1",
                1
            );

            console.log("operations", operations)

        expect(operations).toHaveLength(2);
        expect(
            operations[1]?.operation
        ).toEqual(operation3);
        expect(
            operations[1]?.version
        ).toBe(3);
    });

    it("does not store the same operation twice", async () => {
        const store = new InMemoryOperationStore();

        const operation = {
            type: "insert" as const,
            id: {
                clientId: "client-a",
                sequence: 1,
            },
            element: {
                id: {
                    clientId: "client-a",
                    sequence: 1,
                },
                value: "H",
                after: null,
                deleted: false,
            },
        };

        const first = await store.append(
            "doc-1",
            operation,
        );

        const second = await store.append(
            "doc-1",
            operation,
        );

        expect(first).toEqual(second);

        const operations = await store.getOperations("doc-1");

        expect(operations).toHaveLength(1);
        expect(operations[0]).toEqual(first);
    });
});