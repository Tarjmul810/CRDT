import WorkspaceClient from "@/components/workspace/WorkspaceClient";

type WorkspacePageProps = {
  params: Promise<{
    documentId: string;
  }>;
};

export default async function WorkspacePage({
  params,
}: WorkspacePageProps) {
  const { documentId } = await params;

  return (
    <WorkspaceClient
      documentId={documentId}
    />
  );
}