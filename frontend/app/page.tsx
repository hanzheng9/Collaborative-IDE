"use client";

import { useState } from "react";
import { CodeEditor } from "./components/CodeEditor";
import { CollaboratorList } from "./components/CollaboratorList";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { DeleteFileDialog } from "./components/DeleteFileDialog";
import { FileDialog } from "./components/FileDialog";
import { FileSidebar } from "./components/FileSidebar";
import { useCollaborativeWorkspace } from "./hooks/useCollaborativeWorkspace";
import type { WorkspaceFile } from "./types";

const workspaceId = "demo";

type FileDialogState =
  | { mode: "create" }
  | { mode: "rename"; file: WorkspaceFile }
  | null;

export default function Home() {
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
        <ConnectionStatus
          connectionStatus={connectionStatus}
          syncStatus={syncStatus}
        />
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
