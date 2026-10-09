"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

import { DocumentSession } from "./document-session";
import { DocumentSyncClient } from "./document-sync-client";

type DocumentSessionContextValue = {
  session: DocumentSession;
  syncClient: DocumentSyncClient;
};

const DocumentSessionContext =
  createContext<DocumentSessionContextValue | null>(null);

type DocumentSessionProviderProps = {
  clientId: string;
  documentId: string;
  children: ReactNode;
};

export function DocumentSessionProvider({
  clientId,
  documentId,
  children,
}: DocumentSessionProviderProps) {
  const session = useMemo(
    () => new DocumentSession(clientId),
    [clientId],
  );

  const syncClient = useMemo(
    () =>
      new DocumentSyncClient({
        url: "ws://localhost:8080",
        token: "dev-token",
        clientId,
        documentId,
        session,
      }),
    [
      clientId,
      documentId,
      session,
    ],
  );

  useEffect(() => {
    syncClient.connect();

    return () => {
      syncClient.disconnect();
    };
  }, [syncClient]);

  return (
    <DocumentSessionContext.Provider
      value={{
        session,
        syncClient,
      }}
    >
      {children}
    </DocumentSessionContext.Provider>
  );
}

export function useDocumentSessionContext(): {
  session: DocumentSession;
  syncClient: DocumentSyncClient;
} {
  const context = useContext(
    DocumentSessionContext,
  );

  if (!context) {
    throw new Error(
      "useDocumentSessionContext must be used inside DocumentSessionProvider",
    );
  }

  return context;
}