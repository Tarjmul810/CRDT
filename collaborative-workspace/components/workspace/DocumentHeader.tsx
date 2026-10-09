type DocumentHeaderProps = {
  documentId: string;
};

export default function DocumentHeader({
  documentId,
}: DocumentHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 px-6">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-zinc-200">
          Untitled Document
        </span>

        <span className="text-xs text-zinc-600">
          {documentId}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex h-8 items-center rounded-md border border-zinc-800 px-3 text-xs text-zinc-500">
          Saved
        </div>

        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300">
          T
        </div>
      </div>
    </header>
  );
}