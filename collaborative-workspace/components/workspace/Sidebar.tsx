const documents = [
  {
    id: "document-1",
    title: "Getting Started",
  },
  {
    id: "document-2",
    title: "Project Notes",
  },
  {
    id: "document-3",
    title: "Ideas",
  },
];

export default function Sidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex h-14 items-center border-b border-zinc-800 px-4">
        <div className="text-sm font-semibold tracking-tight">
          Collab
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pb-2 pt-5">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Documents
        </span>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-md text-lg text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-100"
          aria-label="Create new document"
        >
          +
        </button>
      </div>

      <nav className="flex flex-col gap-1 px-2">
        {documents.map((document) => (
          <a
            key={document.id}
            href={`/workspace/${document.id}`}
            className="rounded-md px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100"
          >
            {document.title}
          </a>
        ))}
      </nav>

      <div className="mt-auto border-t border-zinc-800 px-4 py-3">
        <div className="text-xs text-zinc-600">
          Collaborative Workspace
        </div>
      </div>
    </aside>
  );
}