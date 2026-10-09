"use client";

import { useEffect, useState } from "react";

import WorkspaceShell from "./WorkspaceShell";
import { DocumentSessionProvider } from "@/lib/collaboration/document-session-provider";
import { getClientId } from "@/lib/collaboration/client-id";

type WorkspaceClientProps = {
  documentId: string;
};

export default function WorkspaceClient({
  documentId,
}: WorkspaceClientProps) {
  const [clientId, setClientId] =
    useState<string | null>(null);

  useEffect(() => {
    setClientId(getClientId());
  }, []);

  if (!clientId) {
    return null;
  }

  return (
    <DocumentSessionProvider
      clientId={clientId}
      documentId={documentId}
    >
      <WorkspaceShell
        documentId={documentId}
      />
    </DocumentSessionProvider>
  );
}