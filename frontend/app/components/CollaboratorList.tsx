import type { Collaborator, WorkspaceFile } from "../types";

type CollaboratorListProps = {
  collaborators: Collaborator[];
  files: WorkspaceFile[];
  localUserId: string | null;
  onJumpToCollaborator: (collaborator: Collaborator) => void;
};

export function CollaboratorList({
  collaborators,
  files,
  localUserId,
  onJumpToCollaborator
}: CollaboratorListProps) {
  const getFileName = (fileId: string) =>
    files.find((file) => file.fileId === fileId)?.fileName ?? fileId;
  const remoteCollaborators = collaborators.filter(
    (collaborator) => collaborator.userId !== localUserId
  );

  return (
    <div className="collaboratorsPanel">
      <div className="sidebarHeader compact">
        <span>Collaborators</span>
        <span>{collaborators.length}</span>
      </div>

      <div className="collaboratorList">
        {collaborators.length === 0 ? (
          <p className="emptyState">Waiting for collaborators.</p>
        ) : (
          collaborators.map((collaborator) => (
            <button
              className={
                collaborator.userId === localUserId
                  ? "collaboratorItem self"
                  : "collaboratorItem"
              }
              key={collaborator.userId}
              type="button"
              onClick={() => onJumpToCollaborator(collaborator)}
            >
              <span
                className="collaboratorDot"
                style={{ backgroundColor: collaborator.color }}
              />
              <span className="collaboratorText">
                <span>
                  {collaborator.displayName}
                  {collaborator.userId === localUserId ? " (you)" : ""}
                </span>
                <span>{getFileName(collaborator.currentFileId)}</span>
              </span>
            </button>
          ))
        )}
        {collaborators.length > 0 && remoteCollaborators.length === 0 ? (
          <p className="emptyState">Only you are here.</p>
        ) : null}
      </div>
    </div>
  );
}
