
"use client";

import { useEffect, useState } from "react";
import type { DocumentSyncClient, RemoteCursor } from "./document-sync-client";

export function useDocumentCursors(syncClient: DocumentSyncClient) {
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);

  useEffect(() => {
    return syncClient.subscribeCursors(setCursors);
  }, [syncClient]);

  return cursors;
}
