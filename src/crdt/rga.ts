import type {
    DeleteOperation,
    Element,
    ElementId,
    InsertOperation,
    Operation,
} from "./type";
import { VersionVector } from "./version-vector";

export type RGAState = {
    elements: Element[];
    versionVector: Record<string, number>;
};

export class RGA {
    private elements = new Map<string, Element>();

    private pendingOperations: Operation[] = [];

    private pendingDeletes = new Set<string>();

    private versionVector = new VersionVector();

    constructor(private readonly clientId: string) { }

    private hasElement(id: ElementId): boolean {
        return this.elements.has(this.idToString(id));
    }

    private idToString(id: ElementId): string {
        return `${id.clientId}:${id.sequence}`;
    }

    private retryPendingOperations(): void {
        let progress = true;

        while (progress) {
            progress = false;

            const remaining: Operation[] = [];

            for (const operation of this.pendingOperations) {
                if (operation.type === "insert") {
                    const after = operation.element.after;

                    if (
                        after === null ||
                        this.hasElement(after)
                    ) {
                        const key = this.idToString(operation.element.id);

                        if (!this.elements.has(key)) {
                            this.elements.set(
                                key,
                                operation.element
                            );
                        }

                        progress = true;
                        continue;
                    }
                }

                remaining.push(operation);
            }

            this.pendingOperations = remaining;
        }
    }

    private getChildren(parentId: ElementId | null): Element[] {
        return [...this.elements.values()]
            .filter((element) => {
                if (parentId === null) {
                    return element.after === null;
                }

                if (element.after === null) {
                    return false;
                }

                return this.idToString(element.after) === this.idToString(parentId);
            })
            .sort((a, b) => {
                return this.idToString(a.id)
                    .localeCompare(this.idToString(b.id));
            });
    }

    insert(
        value: string,
        after: ElementId | null
    ): InsertOperation {
        const sequence = this.versionVector.increment(this.clientId);

        const id: ElementId = {
            clientId: this.clientId,
            sequence
        };

        const element: Element = {
            id,
            value,
            after,
            deleted: false,
        };

        this.elements.set(this.idToString(id), element);

        return {
            type: "insert",
            id,
            element,
        };
    }

    delete(target: ElementId): DeleteOperation | void {
        const key = this.idToString(target);

        const element = this.elements.get(key);

        if (!element) {
            this.pendingDeletes.add(key);
            return
        }

        element.deleted = true;
    }

    apply(operation: Operation): Operation | void {

        this.versionVector.update(
            operation.id.clientId,
            operation.id.sequence
        )

        if (operation.type === "insert") {
            const key = this.idToString(operation.element.id);

            // Already applied.
            if (this.elements.has(key)) {
                return;
            }

            // The element this operation depends on
            // hasn't arrived yet.
            if (
                operation.element.after !== null &&
                !this.hasElement(operation.element.after)
            ) {
                this.pendingOperations.push(operation);
                return;
            }

            this.elements.set(key, operation.element);

            if (this.pendingDeletes.has(key)) {
                operation.element.deleted = true;
                this.pendingDeletes.delete(key);
            }

            this.retryPendingOperations();

            return operation
        }

        if (operation.type === "delete") {
            this.delete(operation.target);
            return operation;
        }
    }

    getText(): string {
        const result: string[] = [];

        const visit = (parentId: ElementId | null): void => {
            const children = this.getChildren(parentId);

            for (const child of children) {
                if (!child.deleted) {
                    result.push(child.value);
                }

                visit(child.id);
            }
        };

        visit(null);

        return result.join("");
    }

    serialize(): RGAState {
        const elements = [...this.elements.values()].map(
            (element) => ({
                ...element,
                id: { ...element.id },
                after: element.after
                    ? { ...element.after }
                    : null,
            })
        );

        return {
            elements,
            versionVector: this.versionVector.toJSON(),
        };
    }

    restore(state: RGAState): void {
        this.elements.clear();
        this.pendingOperations = [];
        this.pendingDeletes.clear();

        for (const element of state.elements) {
            const key = this.idToString(element.id);

            this.elements.set(key, {
                ...element,
                id: { ...element.id },
                after: element.after
                    ? { ...element.after }
                    : null,
            });
        }

        this.versionVector = VersionVector.fromJSON(
            state.versionVector
        );
    }
}