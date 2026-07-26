import { WorkspacePage } from "../../components/WorkspacePage";
import { isValidWorkspaceId } from "../../workspaceRouter";

type WorkspaceRouteProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspaceRoute({ params }: WorkspaceRouteProps) {
  const { workspaceId } = await params;
  const decodedWorkspaceId = decodeURIComponent(workspaceId);

  if (!isValidWorkspaceId(decodedWorkspaceId)) {
    return (
      <main className="landingPage">
        <section className="landingPanel" aria-labelledby="invalid-workspace-title">
          <h1 id="invalid-workspace-title">Collaborative IDE</h1>
          <p className="landingError">
            This workspace link is invalid. Workspace IDs can use letters,
            numbers, underscores, and hyphens.
          </p>
        </section>
      </main>
    );
  }

  return <WorkspacePage workspaceId={decodedWorkspaceId} />;
}
