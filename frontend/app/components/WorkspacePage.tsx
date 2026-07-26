"use client";

import { useState } from "react";
import { useCollaborativeWorkspace } from "../hooks/useCollaborativeWorkspace";
import type { WorkspaceFile } from "../types";
import { CodeEditor } from "./CodeEditor";
import { CollaboratorList } from "./CollaboratorList";
import { ConnectionStatus } from "./ConnectionStatus";
import { DeleteFileDialog } from "./DeleteFileDialog";
import { FileDialog } from "./FileDialog";
import { FileSidebar } from "./FileSidebar";

type FileDialogState =
  | { mode: "create" }
  | { mode: "rename"; file: WorkspaceFile }
  | null;

type WorkspacePageProps = {
  workspaceId: string;
};

export function WorkspacePage({ workspaceId }: WorkspacePageProps) {
  const {
    collaborators,
    connectionStatus,
    createFile,
    deleteFile,
    feedbackMessage,
    files,
    handleEditorChange,
    handleEditorMount,
    isMonacoReady,
    isWorkspaceLoaded,
    jumpToCollaborator,
    localUserId,
    renameFile,
    selectedFile,
    selectedFileId,
    selectFile,
    showFeedback,
    syncStatus
  } = useCollaborativeWorkspace(workspaceId);
  const [fileDialog, setFileDialog] = useState<FileDialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceFile | null>(null);
  const [isDeletePending, setIsDeletePending] = useState(false);

  const shareWorkspace = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showFeedback("Workspace link copied!");
    } catch {
      showFeedback("Could not copy the workspace link.");
    }
  };

  const handleDeleteFile = () => {
    if (!deleteTarget) {
      return;
    }

    setIsDeletePending(true);
    deleteFile(deleteTarget.fileId, (response) => {
      setIsDeletePending(false);

      if (!response?.ok) {
        showFeedback(response?.error?.message ?? "File deletion failed.");
        return;
      }

      setDeleteTarget(null);
    });
  };

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <h1>Collaborative IDE</h1>
          <p>
            Workspace: {workspaceId}
            {selectedFile ? ` / ${selectedFile.fileName}` : ""}
          </p>
        </div>
        <div className="topbarActions">
          <button type="button" onClick={shareWorkspace}>
            Share
          </button>
          <ConnectionStatus
            connectionStatus={connectionStatus}
            syncStatus={syncStatus}
          />
        </div>
      </header>

      {feedbackMessage ? (
        <div className="feedbackBanner" role="status">
          {feedbackMessage}
        </div>
      ) : null}

      <div className="workspace">
        <aside className="sidebar">
          <FileSidebar
            files={files}
            selectedFileId={selectedFileId}
            onDeleteFile={setDeleteTarget}
            onCreateFile={() => setFileDialog({ mode: "create" })}
            onRenameFile={() => {
              if (!selectedFile) {
                showFeedback("Select a file to rename.");
                return;
              }

              setFileDialog({ mode: "rename", file: selectedFile });
            }}
            onSelectFile={selectFile}
          />

          <CollaboratorList
            collaborators={collaborators}
            files={files}
            localUserId={localUserId}
            onJumpToCollaborator={jumpToCollaborator}
          />
        </aside>

        <section className="editorShell" aria-label="Code editor">
          {!isWorkspaceLoaded && connectionStatus !== "disconnected" ? (
            <div className="editorLoading">Loading workspace...</div>
          ) : (
            <CodeEditor
              isMonacoReady={isMonacoReady}
              selectedFile={selectedFile}
              readOnly={connectionStatus !== "connected"}
              onMount={handleEditorMount}
              onChange={handleEditorChange}
            />
          )}
        </section>
      </div>

      {fileDialog ? (
        <FileDialog
          files={files}
          initialValue={fileDialog.mode === "rename" ? fileDialog.file.fileName : ""}
          mode={fileDialog.mode}
          onCancel={() => setFileDialog(null)}
          onSubmit={
            fileDialog.mode === "create"
              ? (fileName) => {
                  createFile(fileName, () => setFileDialog({ mode: "create" }));
                  setFileDialog(null);
                }
              : (fileName) => {
                  renameFile(fileDialog.file.fileId, fileName, () =>
                    setFileDialog(fileDialog)
                  );
                  setFileDialog(null);
                }
          }
        />
      ) : null}

      {deleteTarget ? (
        <DeleteFileDialog
          file={deleteTarget}
          isPending={isDeletePending}
          onCancel={() => {
            if (!isDeletePending) {
              setDeleteTarget(null);
            }
          }}
          onConfirm={handleDeleteFile}
        />
      ) : null}
    </main>
  );
}
