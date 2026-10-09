"use client";

import { useSyncExternalStore } from "react";

import { DocumentSession } from "./document-session";

export function useDocumentSession(
  session: DocumentSession,
): DocumentSession {
  useSyncExternalStore(
    (onStoreChange) => {
      return session.subscribe(onStoreChange);
    },
    () => session.getVersion(),
    () => session.getVersion(),
  );

  return session;
}