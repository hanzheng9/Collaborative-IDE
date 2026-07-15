"use client";

import { loader, type OnChange, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { CodeEditor } from "./components/CodeEditor";
import { CollaboratorList } from "./components/CollaboratorList";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { DeleteFileDialog } from "./components/DeleteFileDialog";
import { FileDialog } from "./components/FileDialog";
import { FileSidebar } from "./components/FileSidebar";
import type {
  AppErrorPayload,
  CodeChangePayload,
  Collaborator,
  CollaboratorsStatePayload,
  ConnectionStatusValue,
  CursorPosition,
  FileDeletedPayload,
  FileCreatedPayload,
  FileRenamedPayload,
  SyncStatusValue,
  WorkspaceFile,
  WorkspaceStatePayload
} from "./types";

const workspaceId = "demo";
const backendUrl = "http://localhost:4000";

type EditorInstance = Parameters<OnMount>[0];
type EditorViewState = ReturnType<EditorInstance["saveViewState"]>;
type FileDialogState =
  | { mode: "create" }
  | { mode: "rename"; file: WorkspaceFile }
  | null;

function getCollaboratorClassName(userId: string) {
  return `collaborator-${userId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export default function Home() {
  const editorRef = useRef<EditorInstance | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const applyingRemoteChangeRef = useRef(false);
  const selectedFileIdRef = useRef<string | null>(null);
  const filesRef = useRef<WorkspaceFile[]>([]);
  const remoteCursorDecorationIdsRef = useRef<string[]>([]);
  const lineHighlightDecorationIdsRef = useRef<string[]>([]);
  const cursorListenerRef = useRef<{ dispose: () => void } | null>(null);
  const editorViewStatesRef = useRef(new Map<string, EditorViewState>());
  const syncTimerRef = useRef<number | null>(null);
  const jumpTargetRef = useRef<Collaborator | null>(null);
  const currentCursorRef = useRef<CursorPosition | null>(null);
  const [isMonacoReady, setIsMonacoReady] = useState(false);
  const [isWorkspaceLoaded, setIsWorkspaceLoaded] = useState(false);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [localUserId, setLocalUserId] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatusValue>("connecting");
  const [syncStatus, setSyncStatus] = useState<SyncStatusValue>("syncing");
  const [fileDialog, setFileDialog] = useState<FileDialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceFile | null>(null);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");

  const selectedFile =
    files.find((file) => file.fileId === selectedFileId) ?? null;

  const showFeedback = (message: string) => {
    setFeedbackMessage(message);
    window.setTimeout(() => {
      setFeedbackMessage("");
    }, 3500);
  };

  const markSyncedSoon = () => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    setSyncStatus("syncing");
    syncTimerRef.current = window.setTimeout(() => {
      setSyncStatus(
        socketRef.current?.connected ? "synced" : "connection-lost"
      );
    }, 350);
  };

  const saveCurrentViewState = () => {
    const editor = editorRef.current;
    const fileId = selectedFileIdRef.current;

    if (!editor || !fileId) {
      return;
    }

    editorViewStatesRef.current.set(fileId, editor.saveViewState());
  };

  const selectFile = (fileId: string) => {
    saveCurrentViewState();
    setSelectedFileId(fileId);
  };

  const applyEditorContent = (code: string) => {
    const editor = editorRef.current;

    if (!editor || editor.getValue() === code) {
      return;
    }

    const viewState = editor.saveViewState();
    const position = editor.getPosition();

    applyingRemoteChangeRef.current = true;
    editor.setValue(code);

    if (viewState) {
      editor.restoreViewState(viewState);
    }

    if (position) {
      editor.setPosition(position);
    }

    applyingRemoteChangeRef.current = false;
  };

  useEffect(() => {
    selectedFileIdRef.current = selectedFileId;
  }, [selectedFileId]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    const socket = io(backendUrl, {
      reconnection: true
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionStatus("connected");
      setSyncStatus("syncing");
      setLocalUserId(socket.id ?? null);
      socket.emit("join-workspace", { workspaceId });
    });

    socket.io.on("reconnect_attempt", () => {
      setConnectionStatus("reconnecting");
      setSyncStatus("connection-lost");
    });

    socket.on("disconnect", () => {
      setConnectionStatus("disconnected");
      setSyncStatus("connection-lost");
      showFeedback("Connection lost. Editing is paused until reconnect.");
    });

    socket.io.on("reconnect_failed", () => {
      setConnectionStatus("reconnection-failed");
      setSyncStatus("connection-lost");
      showFeedback("Reconnection failed. Restart the backend and refresh if needed.");
    });

    socket.on("workspace-state", (payload: WorkspaceStatePayload) => {
      if (payload.workspaceId !== workspaceId) {
        return;
      }

      setFiles(payload.files);
      editorViewStatesRef.current.forEach((_value, fileId) => {
        const fileStillExists = payload.files.some((file) => file.fileId === fileId);

        if (!fileStillExists) {
          editorViewStatesRef.current.delete(fileId);
        }
      });
      setIsWorkspaceLoaded(true);
      setSyncStatus("synced");
      setSelectedFileId((currentFileId) => {
        const currentStillExists = payload.files.some(
          (file) => file.fileId === currentFileId
        );

        return currentStillExists
          ? currentFileId
          : (payload.files[0]?.fileId ?? null);
      });
      showFeedback("Workspace state refreshed from the backend session.");
    });

    socket.on("code-change", (payload: CodeChangePayload) => {
      if (payload.workspaceId !== workspaceId) {
        return;
      }

      const fileExists = filesRef.current.some(
        (file) => file.fileId === payload.fileId
      );

      if (!fileExists && selectedFileIdRef.current !== payload.fileId) {
        return;
      }

      setFiles((currentFiles) =>
        currentFiles.map((file) =>
          file.fileId === payload.fileId
            ? { ...file, content: payload.code }
            : file
        )
      );

      if (selectedFileIdRef.current === payload.fileId) {
        applyEditorContent(payload.code);
      }

      setSyncStatus("synced");
    });

    socket.on("file-created", (payload: FileCreatedPayload) => {
      if (payload.workspaceId !== workspaceId) {
        return;
      }

      setFiles((currentFiles) => {
        const fileAlreadyExists = currentFiles.some(
          (file) => file.fileId === payload.file.fileId
        );

        return fileAlreadyExists
          ? currentFiles
          : [...currentFiles, payload.file];
      });

      if (payload.createdBy === socket.id) {
        setSelectedFileId(payload.file.fileId);
      }

      setSyncStatus("synced");
    });

    socket.on("file-renamed", (payload: FileRenamedPayload) => {
      if (payload.workspaceId !== workspaceId) {
        return;
      }

      setFiles((currentFiles) =>
        currentFiles.map((file) =>
          file.fileId === payload.file.fileId ? payload.file : file
        )
      );
      setSyncStatus("synced");
    });

    socket.on("file-deleted", (payload: FileDeletedPayload) => {
      if (payload.workspaceId !== workspaceId) {
        return;
      }

      editorViewStatesRef.current.delete(payload.fileId);
      remoteCursorDecorationIdsRef.current = editorRef.current
        ? editorRef.current.deltaDecorations(remoteCursorDecorationIdsRef.current, [])
        : [];
      setFiles((currentFiles) => {
        const nextFiles = currentFiles.filter(
          (file) => file.fileId !== payload.fileId
        );

        setSelectedFileId((currentFileId) => {
          if (currentFileId !== payload.fileId) {
            return currentFileId;
          }

          return (
            payload.fallbackFileId ??
            nextFiles[0]?.fileId ??
            null
          );
        });

        return nextFiles;
      });
      setSyncStatus("synced");
    });

    socket.on("file-operation-error", (payload: AppErrorPayload) => {
      showFeedback(payload.message);
      setSyncStatus(socket.connected ? "synced" : "connection-lost");
      setIsDeletePending(false);
    });

    socket.on("workspace-error", (payload: AppErrorPayload) => {
      showFeedback(payload.message);
    });

    socket.on("collaborators-state", (payload: CollaboratorsStatePayload) => {
      if (payload.workspaceId !== workspaceId) {
        return;
      }

      setCollaborators(payload.collaborators);
    });

    return () => {
      cursorListenerRef.current?.dispose();
      socket.io.off("reconnect_attempt");
      socket.io.off("reconnect_failed");
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const socket = socketRef.current;

    if (!socket || !selectedFileId) {
      return;
    }

      socket.emit("file-selected", {
        workspaceId,
        fileId: selectedFileId
      });

      if (currentCursorRef.current) {
        socket.emit("cursor-change", {
          workspaceId,
          fileId: selectedFileId,
          cursorPosition: currentCursorRef.current
        });
      }
  }, [selectedFileId]);

  useEffect(() => {
    let isMounted = true;

    import("monaco-editor").then((monaco) => {
      loader.config({ monaco });

      if (isMounted) {
        setIsMonacoReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      return;
    }

    applyEditorContent(selectedFile.content);
  }, [selectedFile]);

  useEffect(() => {
    const styleId = "collaborator-cursor-styles";
    let style = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }

    style.textContent = collaborators
      .map((collaborator) => {
        const className = getCollaboratorClassName(collaborator.userId);

        return `
.remoteCursor.${className} {
  border-left: 2px solid ${collaborator.color};
}
.remoteCursor.${className}::after {
  background: ${collaborator.color};
  color: #ffffff;
  content: "${collaborator.displayName}";
}`;
      })
      .join("\n");
  }, [collaborators]);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor || !selectedFileId) {
      return;
    }

    const decorations = collaborators
      .filter(
        (collaborator) =>
          collaborator.userId !== localUserId &&
          collaborator.currentFileId === selectedFileId &&
          collaborator.cursorPosition
      )
      .map((collaborator) => ({
        range: {
          startLineNumber: collaborator.cursorPosition?.lineNumber ?? 1,
          startColumn: collaborator.cursorPosition?.column ?? 1,
          endLineNumber: collaborator.cursorPosition?.lineNumber ?? 1,
          endColumn: collaborator.cursorPosition?.column ?? 1
        },
        options: {
          className: `remoteCursor ${getCollaboratorClassName(
            collaborator.userId
          )}`,
          hoverMessage: { value: collaborator.displayName }
        }
      }));

    remoteCursorDecorationIdsRef.current = editor.deltaDecorations(
      remoteCursorDecorationIdsRef.current,
      decorations
    );
  }, [collaborators, localUserId, selectedFileId]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    cursorListenerRef.current?.dispose();

    if (selectedFile) {
      applyingRemoteChangeRef.current = true;
      editor.setValue(selectedFile.content);

      const savedViewState = editorViewStatesRef.current.get(selectedFile.fileId);

      if (savedViewState) {
        editor.restoreViewState(savedViewState);
      }

      applyingRemoteChangeRef.current = false;
    }

    cursorListenerRef.current = editor.onDidChangeCursorPosition((event) => {
      const fileId = selectedFileIdRef.current;

      if (!fileId) {
        return;
      }

      socketRef.current?.emit("cursor-change", {
        workspaceId,
        fileId,
        cursorPosition: {
          lineNumber: event.position.lineNumber,
          column: event.position.column
        }
      });
      currentCursorRef.current = {
        lineNumber: event.position.lineNumber,
        column: event.position.column
      };
    });

    const jumpTarget = jumpTargetRef.current;

    if (jumpTarget?.cursorPosition) {
      jumpTargetRef.current = null;
      window.setTimeout(() => jumpToCursor(jumpTarget), 40);
    }
  };

  const handleEditorChange: OnChange = (value) => {
    if (applyingRemoteChangeRef.current || value === undefined) {
      return;
    }

    if (!selectedFileId) {
      showFeedback("Select a file before editing.");
      return;
    }

    if (!socketRef.current?.connected) {
      setSyncStatus("connection-lost");
      showFeedback("Connection lost. Editing is disabled until reconnect.");
      return;
    }

    setSyncStatus("unsaved");
    setFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.fileId === selectedFileId ? { ...file, content: value } : file
      )
    );

    socketRef.current.emit("code-change", {
      workspaceId,
      fileId: selectedFileId,
      code: value
    });
    markSyncedSoon();
  };

  const handleCreateFile = (fileName: string) => {
    if (!socketRef.current?.connected) {
      showFeedback("Cannot create a file while disconnected.");
      return;
    }

    setSyncStatus("syncing");
    socketRef.current.emit(
      "create-file",
      {
        workspaceId,
        fileName
      },
      (response?: { ok: boolean; error?: AppErrorPayload }) => {
        if (!response?.ok) {
          showFeedback(response?.error?.message ?? "File creation failed.");
          setSyncStatus(socketRef.current?.connected ? "synced" : "connection-lost");
        }
      }
    );
    setFileDialog(null);
  };

  const handleDeleteFile = () => {
    if (!deleteTarget) {
      return;
    }

    if (!socketRef.current?.connected) {
      showFeedback("Cannot delete a file while disconnected.");
      return;
    }

    setIsDeletePending(true);
    setSyncStatus("syncing");
    socketRef.current.emit(
      "delete-file",
      {
        workspaceId,
        fileId: deleteTarget.fileId
      },
      (response?: { ok: boolean; error?: AppErrorPayload }) => {
        setIsDeletePending(false);

        if (!response?.ok) {
          showFeedback(response?.error?.message ?? "File deletion failed.");
          setSyncStatus(socketRef.current?.connected ? "synced" : "connection-lost");
          return;
        }

        setDeleteTarget(null);
      }
    );
  };

  const handleRenameFile = (fileName: string) => {
    if (!socketRef.current?.connected || fileDialog?.mode !== "rename") {
      showFeedback("Cannot rename this file right now.");
      return;
    }

    setSyncStatus("syncing");
    socketRef.current.emit(
      "rename-file",
      {
        workspaceId,
        fileId: fileDialog.file.fileId,
        fileName
      },
      (response?: { ok: boolean; error?: AppErrorPayload }) => {
        if (!response?.ok) {
          showFeedback(response?.error?.message ?? "File rename failed.");
          setSyncStatus(socketRef.current?.connected ? "synced" : "connection-lost");
        }
      }
    );
    setFileDialog(null);
  };

  const handleJumpToCollaborator = (collaborator: Collaborator) => {
    const cursorPosition = collaborator.cursorPosition;
    const fileExists = files.some(
      (file) => file.fileId === collaborator.currentFileId
    );

    if (!fileExists) {
      showFeedback("That collaborator's file is not available.");
      return;
    }

    if (!cursorPosition) {
      selectFile(collaborator.currentFileId);
      showFeedback("That collaborator has not placed their cursor yet.");
      return;
    }

    jumpTargetRef.current = collaborator;
    selectFile(collaborator.currentFileId);
    window.setTimeout(() => jumpToCursor(collaborator), 90);
  };

  const jumpToCursor = (collaborator: Collaborator) => {
    const cursorPosition = collaborator.cursorPosition;
    const editor = editorRef.current;

    if (!editor || !cursorPosition) {
      return;
    }

    editor.revealPositionInCenter(cursorPosition);
    editor.setPosition(cursorPosition);
    editor.focus();

    lineHighlightDecorationIdsRef.current = editor.deltaDecorations(
      lineHighlightDecorationIdsRef.current,
      [
        {
          range: {
            startLineNumber: cursorPosition.lineNumber,
            startColumn: 1,
            endLineNumber: cursorPosition.lineNumber,
            endColumn: 1
          },
          options: {
            isWholeLine: true,
            className: "jumpLineHighlight"
          }
        }
      ]
    );

    window.setTimeout(() => {
      if (!editorRef.current) {
        return;
      }

      lineHighlightDecorationIdsRef.current =
        editorRef.current.deltaDecorations(
          lineHighlightDecorationIdsRef.current,
          []
        );
    }, 1200);
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
            onJumpToCollaborator={handleJumpToCollaborator}
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
            fileDialog.mode === "create" ? handleCreateFile : handleRenameFile
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
