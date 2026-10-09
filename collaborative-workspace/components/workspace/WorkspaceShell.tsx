import Sidebar from "./Sidebar";
import DocumentHeader from "./DocumentHeader";
import BlockEditor from "./BlockEditor";

type WorkspaceShellProps = {
  documentId: string;
};

export default function WorkspaceShell({
  documentId,
}: WorkspaceShellProps) {
  return (
    <main className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <Sidebar />

      <section className="flex min-w-0 flex-1 flex-col">
        <DocumentHeader documentId={documentId} />

        <div className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-4xl px-12 py-16">
            <BlockEditor />
          </div>
        </div>
      </section>
    </main>
  );
}