import type { Operation } from "../crdt/type";
import type { LocalDocument, LocalStore } from "./local-store";

const DATABASE_NAME = "collaborative-workspace";
const DATABASE_VERSION = 1;

const DOCUMENTS_STORE = "documents";
const PENDING_OPERATIONS_STORE = "pendingOperations";

export class IndexedDBLocalStore implements LocalStore {
  private readonly dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = this.openDatabase();
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(
        DATABASE_NAME,
        DATABASE_VERSION
      );

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
          db.createObjectStore(DOCUMENTS_STORE, {
            keyPath: "documentId",
          });
        }

        if (
          !db.objectStoreNames.contains(
            PENDING_OPERATIONS_STORE
          )
        ) {
          db.createObjectStore(PENDING_OPERATIONS_STORE, {
            keyPath: [
              "documentId",
              "clientId",
              "sequence",
            ],
          });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async saveDocument(
    document: LocalDocument
  ): Promise<void> {
    const db = await this.dbPromise;

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        DOCUMENTS_STORE,
        "readwrite"
      );

      transaction.objectStore(DOCUMENTS_STORE).put(document);

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(transaction.error);
      };

      transaction.onabort = () => {
        reject(transaction.error);
      };
    });
  }

  async loadDocument(
    documentId: string
  ): Promise<LocalDocument | null> {
    const db = await this.dbPromise;

    return new Promise<LocalDocument | null>(
      (resolve, reject) => {
        const transaction = db.transaction(
          DOCUMENTS_STORE,
          "readonly"
        );

        console.log("transaction", transaction.objectStore(DOCUMENTS_STORE).get(documentId));

        const request = transaction
          .objectStore(DOCUMENTS_STORE)
          .get(documentId);

          console.log("request", request);

        request.onsuccess = () => {
          resolve(request.result ?? null);
        };

        request.onerror = () => {
          reject(request.error);
        };
      }
    );
  }

  async savePendingOperation(
    documentId: string,
    operation: Operation
  ): Promise<void> {
    const db = await this.dbPromise;

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        PENDING_OPERATIONS_STORE,
        "readwrite"
      );

      transaction
        .objectStore(PENDING_OPERATIONS_STORE)
        .put({
          documentId,
          clientId: operation.id.clientId,
          sequence: operation.id.sequence,
          operation,
        });

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(transaction.error);
      };

      transaction.onabort = () => {
        reject(transaction.error);
      };
    });
  }

  async removePendingOperation(
    documentId: string,
    operationId: {
      clientId: string;
      sequence: number;
    }
  ): Promise<void> {
    const db = await this.dbPromise;

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        PENDING_OPERATIONS_STORE,
        "readwrite"
      );

      transaction
        .objectStore(PENDING_OPERATIONS_STORE)
        .delete([
          documentId,
          operationId.clientId,
          operationId.sequence,
        ]);

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(transaction.error);
      };

      transaction.onabort = () => {
        reject(transaction.error);
      };
    });
  }

  close(): void {
  this.dbPromise.then((db) => {
    db.close();
  });
}

  async getPendingOperations(
    documentId: string
  ): Promise<Operation[]> {
    const db = await this.dbPromise;

    return new Promise<Operation[]>(
      (resolve, reject) => {
        const transaction = db.transaction(
          PENDING_OPERATIONS_STORE,
          "readonly"
        );

        const store = transaction.objectStore(
          PENDING_OPERATIONS_STORE
        );

        const request = store.getAll();

        request.onsuccess = () => {
          const records = request.result as Array<{
            documentId: string;
            clientId: string;
            sequence: number;
            operation: Operation;
          }>;

          const operations = records
            .filter(
              (record) =>
                record.documentId === documentId
            )
            .sort(
              (a, b) =>
                a.sequence - b.sequence
            )
            .map(
              (record) => record.operation
            );

          resolve(operations);
        };

        request.onerror = () => {
          reject(request.error);
        };
      }
    );
  }
}