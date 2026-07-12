"use client";

import { loader, type OnChange, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { CodeEditor } from "./components/CodeEditor";
import { CollaboratorList } from "./components/CollaboratorList";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { FileDialog } from "./components/FileDialog";
import { FileSidebar } from "./components/FileSidebar";
import type {
  CodeChangePayload,
  Collaborator,
  CollaboratorsStatePayload,
  ConnectionStatusValue,
  FileCreatedPayload,
  FileOperationErrorPayload,
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
  const remoteCursorDecorationIdsRef = useRef<string[]>([]);
  const lineHighlightDecorationIdsRef = useRef<string[]>([]);
  const cursorListenerRef = useRef<{ dispose: () => void } | null>(null);
  const editorViewStatesRef = useRef(new Map<string, EditorViewState>());
  const syncTimerRef = useRef<number | null>(null);
  const jumpTargetRef = useRef<Collaborator | null>(null);
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
    });

    socket.on("workspace-state", (payload: WorkspaceStatePayload) => {
      if (payload.workspaceId !== workspaceId) {
        return;
      }

      setFiles(payload.files);
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
    });

    socket.on("code-change", (payload: CodeChangePayload) => {
      if (payload.workspaceId !== workspaceId) {
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

    socket.on("file-operation-error", (payload: FileOperationErrorPayload) => {
      showFeedback(payload.message);
      setSyncStatus(socket.connected ? "synced" : "connection-lost");
    });

    socket.on("workspace-error", (payload: FileOperationErrorPayload) => {
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

    setSyncStatus(
      socketRef.current?.connected ? "unsaved" : "connection-lost"
    );
    setFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.fileId === selectedFileId ? { ...file, content: value } : file
      )
    );

    if (!socketRef.current?.connected) {
      return;
    }

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
    socketRef.current.emit("create-file", {
      workspaceId,
      fileName
    });
    setFileDialog(null);
  };

  const handleRenameFile = (fileName: string) => {
    if (!socketRef.current?.connected || fileDialog?.mode !== "rename") {
      showFeedback("Cannot rename this file right now.");
      return;
    }

    setSyncStatus("syncing");
    socketRef.current.emit("rename-file", {
      workspaceId,
      fileId: fileDialog.file.fileId,
      fileName
    });
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
    </main>
  );
}
