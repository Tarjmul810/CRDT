"use client";

import { useEffect, useState } from "react";
import { useDocumentSessionContext } from "@/lib/collaboration/document-session-provider";
import type { PresenceUser } from "@/lib/collaboration/document-sync-client";

type DocumentHeaderProps = {
  documentId: string;
};

export default function DocumentHeader({
  documentId,
}: DocumentHeaderProps) {
  const { syncClient } = useDocumentSessionContext();

  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    return syncClient.subscribePresence(setUsers);
  }, [syncClient]);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-sm font-medium text-zinc-200">
          Untitled Document
        </span>
        <span className="hidden text-xs text-zinc-600 sm:inline">
          {documentId}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="flex -space-x-2">
          {users.slice(0, 4).map((user) => (
            <div
              key={user.clientId}
              title={`Client ${user.clientId}`}
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-zinc-950 bg-zinc-800 text-xs font-medium uppercase text-zinc-200"
            >
              {user.clientId.slice(0, 2)}
            </div>
          ))}
        </div>

        {users.length > 0 && (
          <span className="text-xs text-zinc-500">
            {users.length} {users.length === 1 ? "participant" : "participants"}
          </span>
        )}

        {users.length > 4 && (
          <span className="text-xs text-zinc-500">
            +{users.length - 4}
          </span>
        )}

        <div className="flex h-8 items-center rounded-md border border-zinc-800 px-3 text-xs text-zinc-500">
          Saved
        </div>
      </div>
    </header>
  )
}