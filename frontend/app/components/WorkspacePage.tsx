"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isExecutableLanguage,
  runCode,
  type ExecutionResult
} from "../codeExecution";
import { useCollaborativeWorkspace } from "../hooks/useCollaborativeWorkspace";
import type { WorkspaceFile } from "../types";
import { AiAssistantPanel } from "./AiAssistantPanel";
import { CodeEditor } from "./CodeEditor";
import { CollaboratorList } from "./CollaboratorList";
import { ConnectionStatus } from "./ConnectionStatus";
import { DeleteFileDialog } from "./DeleteFileDialog";
import { ExecutionPanel } from "./ExecutionPanel";
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
    getAiSelection,
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
    syncStatus,
    replaceAiSelection
  } = useCollaborativeWorkspace(workspaceId);
  const executionAbortRef = useRef<AbortController | null>(null);
  const executionRequestIdRef = useRef(0);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isExecutionPanelOpen, setIsExecutionPanelOpen] = useState(false);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [executionError, setExecutionError] = useState("");
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(
    null
  );
  const [stdin, setStdin] = useState("");
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

  const runSelectedFile = useCallback(async () => {
    if (!selectedFile) {
      setIsExecutionPanelOpen(true);
      setExecutionError("Select a file before running code.");
      return;
    }

    if (!isExecutableLanguage(selectedFile.language)) {
      setIsExecutionPanelOpen(true);
      setExecutionError("This file language is not supported for code execution.");
      return;
    }

    executionAbortRef.current?.abort();
    const abortController = new AbortController();
    executionAbortRef.current = abortController;
    const requestId = executionRequestIdRef.current + 1;
    executionRequestIdRef.current = requestId;

    setIsExecutionPanelOpen(true);
    setIsRunningCode(true);
    setExecutionError("");
    setExecutionResult(null);

    try {
      const result = await runCode(
        workspaceId,
        selectedFile,
        files,
        stdin,
        abortController.signal
      );

      if (executionRequestIdRef.current === requestId) {
        setExecutionResult(result);
      }
    } catch (error) {
      if (
        abortController.signal.aborted ||
        executionRequestIdRef.current !== requestId
      ) {
        return;
      }

      setExecutionError(
        error instanceof Error ? error.message : "Code execution failed."
      );
    } finally {
      if (executionRequestIdRef.current === requestId) {
        setIsRunningCode(false);
      }
    }
  }, [files, selectedFile, stdin, workspaceId]);

  const stopExecution = () => {
    executionAbortRef.current?.abort();
    executionRequestIdRef.current += 1;
    setIsRunningCode(false);
    setExecutionError("Execution request stopped locally.");
  };

  const clearExecutionOutput = () => {
    setExecutionError("");
    setExecutionResult(null);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void runSelectedFile();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      executionAbortRef.current?.abort();
    };
  }, [runSelectedFile]);

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
          <button type="button" onClick={() => void runSelectedFile()}>
            Run Code
          </button>
          <button disabled={!isRunningCode} type="button" onClick={stopExecution}>
            Stop
          </button>
          <button type="button" onClick={() => setIsAiPanelOpen(true)}>
            Ask AI
          </button>
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

      <div className={isAiPanelOpen ? "workspace withAiPanel" : "workspace"}>
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

        <section className="editorColumn" aria-label="Code editor">
          <div className="editorShell">
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
          </div>

          {isExecutionPanelOpen ? (
            <ExecutionPanel
              error={executionError}
              isRunning={isRunningCode}
              result={executionResult}
              stdin={stdin}
              setStdin={setStdin}
              onClear={clearExecutionOutput}
              onRun={() => void runSelectedFile()}
              onStop={stopExecution}
            />
          ) : null}
        </section>

        {isAiPanelOpen ? (
          <AiAssistantPanel
            getSelection={getAiSelection}
            onClose={() => setIsAiPanelOpen(false)}
            onReplaceSelection={replaceAiSelection}
          />
        ) : null}
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
