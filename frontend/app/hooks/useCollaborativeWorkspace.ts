"use client";

import { loader, type OnChange, type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { BACKEND_URL } from "../backendUrl";
import { configureMonacoWorkers } from "../monacoWorkers";
import type {
  AppErrorPayload,
  ClientToServerEvents,
  CodeChangePayload,
  Collaborator,
  CollaboratorsStatePayload,
  ConnectionStatusValue,
  CursorPosition,
  FileCreatedPayload,
  FileDeletedPayload,
  FileRenamedPayload,
  OperationAck,
  ServerToClientEvents,
  SyncStatusValue,
  WorkspaceFile,
  WorkspaceStatePayload
} from "../types";
import {
  addRecentWorkspace,
  removeRecentWorkspace
} from "../utils/recentWorkspaces";

const cursorEmitThrottleMs = 80;

type EditorInstance = Parameters<OnMount>[0];
type EditorViewState = ReturnType<EditorInstance["saveViewState"]>;
type CollaborativeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type AiCodeSelection = {
  code: string;
  fileId: string;
  fileName: string;
  language: string;
  range: {
    endColumn: number;
    endLineNumber: number;
    startColumn: number;
    startLineNumber: number;
  };
  surroundingCode?: string;
};

function getCollaboratorClassName(userId: string) {
  return `collaborator-${userId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function rangesMatch(
  first: AiCodeSelection["range"] | null | undefined,
  second: AiCodeSelection["range"] | null | undefined
) {
  return (
    first?.startLineNumber === second?.startLineNumber &&
    first?.startColumn === second?.startColumn &&
    first?.endLineNumber === second?.endLineNumber &&
    first?.endColumn === second?.endColumn
  );
}

export function useCollaborativeWorkspace(workspaceId: string) {
  const editorRef = useRef<EditorInstance | null>(null);
  const socketRef = useRef<CollaborativeSocket | null>(null);
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
  const lastCursorEmitRef = useRef(0);
  const layoutFrameRef = useRef<number | null>(null);
  const intentionalLeaveRef = useRef(false);
  const [isMonacoReady, setIsMonacoReady] = useState(false);
  const [isWorkspaceLoaded, setIsWorkspaceLoaded] = useState(false);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [workspaceName, setWorkspaceName] = useState("Untitled Workspace");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [localUserId, setLocalUserId] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [cursorPosition, setCursorPosition] = useState<CursorPosition | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatusValue>("connecting");
  const [syncStatus, setSyncStatus] = useState<SyncStatusValue>("syncing");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [workspaceError, setWorkspaceError] = useState<AppErrorPayload | null>(
    null
  );

  const selectedFile =
    files.find((file) => file.fileId === selectedFileId) ?? null;

  const relayoutEditor = useCallback(() => {
    if (layoutFrameRef.current !== null) {
      cancelAnimationFrame(layoutFrameRef.current);
    }

    layoutFrameRef.current = requestAnimationFrame(() => {
      layoutFrameRef.current = null;
      editorRef.current?.layout();
    });
  }, []);

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
    const model = editor?.getModel();

    if (!editor || !model || editor.getValue() === code) {
      return;
    }

    const viewState = editor.saveViewState();
    const position = editor.getPosition();

    try {
      applyingRemoteChangeRef.current = true;
      model.pushEditOperations(
        [],
        [
          {
            range: model.getFullModelRange(),
            text: code
          }
        ],
        () => null
      );

      if (viewState) {
        editor.restoreViewState(viewState);
      }

      if (position) {
        editor.setPosition(position);
      }

      const restoredPosition = editor.getPosition();

      if (restoredPosition) {
        currentCursorRef.current = {
          lineNumber: restoredPosition.lineNumber,
          column: restoredPosition.column
        };
        setCursorPosition(currentCursorRef.current);
      }
    } finally {
      applyingRemoteChangeRef.current = false;
    }
  };

  useEffect(() => {
    selectedFileIdRef.current = selectedFileId;
  }, [selectedFileId]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    const socket: CollaborativeSocket = io(BACKEND_URL, {
      reconnection: true
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionStatus("connected");
      setSyncStatus("syncing");
      setLocalUserId(socket.id ?? null);
      const createMarkerKey = `collaborativeIde.createWorkspace.${workspaceId}`;
      const createIfMissing =
        window.sessionStorage.getItem(createMarkerKey) === "true";

      socket.emit("join-workspace", { workspaceId, createIfMissing });
      window.sessionStorage.removeItem(createMarkerKey);
    });

    socket.io.on("reconnect_attempt", () => {
      setConnectionStatus("reconnecting");
      setSyncStatus("connection-lost");
    });

    socket.on("disconnect", () => {
      setConnectionStatus("disconnected");
      setSyncStatus("connection-lost");
      if (!intentionalLeaveRef.current) {
        showFeedback("Connection lost. Editing is paused until reconnect.");
      }
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
      setWorkspaceName(payload.name);
      addRecentWorkspace({
        workspaceId,
        name: payload.name,
        lastFileName: payload.files[0]?.fileName
      });
      setWorkspaceError(null);
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

    socket.on("workspace-renamed", (payload) => {
      if (payload.workspaceId !== workspaceId) {
        return;
      }

      setWorkspaceName(payload.name);
      addRecentWorkspace({
        workspaceId,
        name: payload.name,
        lastFileName: filesRef.current.find(
          (file) => file.fileId === selectedFileIdRef.current
        )?.fileName
      });
      setSyncStatus("synced");
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

          return payload.fallbackFileId ?? nextFiles[0]?.fileId ?? null;
        });

        return nextFiles;
      });
      setSyncStatus("synced");
    });

    socket.on("file-operation-error", (payload: AppErrorPayload) => {
      showFeedback(payload.message);
      setSyncStatus(socket.connected ? "synced" : "connection-lost");
    });

    socket.on("workspace-error", (payload: AppErrorPayload) => {
      if (payload.code === "WORKSPACE_NOT_FOUND") {
        removeRecentWorkspace(workspaceId);
      }

      setWorkspaceError(payload);
      setIsWorkspaceLoaded(false);
      setFiles([]);
      setSelectedFileId(null);
      setCollaborators([]);
      showFeedback(payload.message);
    });

    socket.on("collaborators-state", (payload: CollaboratorsStatePayload) => {
      if (payload.workspaceId !== workspaceId) {
        return;
      }

      setCollaborators(payload.collaborators);
    });

    return () => {
      if (layoutFrameRef.current !== null) {
        cancelAnimationFrame(layoutFrameRef.current);
      }
      cursorListenerRef.current?.dispose();
      socket.io.off("reconnect_attempt");
      socket.io.off("reconnect_failed");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [workspaceId]);

  useEffect(() => {
    const socket = socketRef.current;

    if (!socket || !selectedFileId) {
      return;
    }

    socket.emit("file-selected", {
      workspaceId,
      fileId: selectedFileId
    });
  }, [selectedFileId, workspaceId]);

  useEffect(() => {
    let isMounted = true;

    import("monaco-editor").then((monaco) => {
      configureMonacoWorkers();
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
      .map((collaborator) => {
        const cursorPosition = collaborator.cursorPosition;

        if (!cursorPosition) {
          return null;
        }

        return {
          range: {
            startLineNumber: cursorPosition.lineNumber,
            startColumn: cursorPosition.column,
            endLineNumber: cursorPosition.lineNumber,
            endColumn: cursorPosition.column
          },
          options: {
            className: `remoteCursor ${getCollaboratorClassName(
              collaborator.userId
            )}`,
            hoverMessage: { value: collaborator.displayName }
          }
        };
      })
      .filter((decoration) => decoration !== null);

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
      if (applyingRemoteChangeRef.current) {
        return;
      }

      const fileId = selectedFileIdRef.current;

      if (!fileId) {
        return;
      }

      currentCursorRef.current = {
        lineNumber: event.position.lineNumber,
        column: event.position.column
      };
      setCursorPosition(currentCursorRef.current);

      const now = Date.now();

      if (now - lastCursorEmitRef.current < cursorEmitThrottleMs) {
        return;
      }

      lastCursorEmitRef.current = now;
      socketRef.current?.emit("cursor-change", {
        workspaceId,
        fileId,
        cursorPosition: currentCursorRef.current
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

  const getAiSelection = (): AiCodeSelection | null => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const selection = editor?.getSelection();

    if (!editor || !model || !selection || selection.isEmpty() || !selectedFile) {
      return null;
    }

    const code = model.getValueInRange(selection).trim();

    if (!code) {
      return null;
    }

    const startLineNumber = Math.max(1, selection.startLineNumber - 5);
    const endLineNumber = Math.min(
      model.getLineCount(),
      selection.endLineNumber + 5
    );
    const surroundingCode = model.getValueInRange({
      startLineNumber,
      startColumn: 1,
      endLineNumber,
      endColumn: model.getLineMaxColumn(endLineNumber)
    });

    return {
      code,
      fileId: selectedFile.fileId,
      fileName: selectedFile.fileName,
      language: selectedFile.language,
      range: {
        endColumn: selection.endColumn,
        endLineNumber: selection.endLineNumber,
        startColumn: selection.startColumn,
        startLineNumber: selection.startLineNumber
      },
      surroundingCode
    };
  };

  const replaceAiSelection = (
    selection: AiCodeSelection,
    replacementCode: string
  ) => {
    const editor = editorRef.current;
    const currentSelection = editor?.getSelection();

    if (!editor || !currentSelection || currentSelection.isEmpty()) {
      return { ok: false as const, error: "The editor is not ready." };
    }

    if (selection.fileId !== selectedFileIdRef.current) {
      return {
        ok: false as const,
        error: "The selected file changed after this AI request started."
      };
    } else if (!rangesMatch(selection.range, currentSelection)) {
      return {
        ok: false as const,
        error: "The editor selection changed after this AI request started."
      };
    }

    editor.pushUndoStop();
    editor.executeEdits("ai-assistant", [
      {
        forceMoveMarkers: true,
        range: selection.range,
        text: replacementCode
      }
    ]);
    editor.pushUndoStop();
    editor.focus();

    return { ok: true as const };
  };

  const createFile = (fileName: string, onError?: () => void) => {
    if (!socketRef.current?.connected) {
      showFeedback("Cannot create a file while disconnected.");
      onError?.();
      return;
    }

    setSyncStatus("syncing");
    socketRef.current.emit(
      "create-file",
      {
        workspaceId,
        fileName
      },
      (response?: OperationAck) => {
        if (!response?.ok) {
          showFeedback(response?.error?.message ?? "File creation failed.");
          setSyncStatus(socketRef.current?.connected ? "synced" : "connection-lost");
          onError?.();
        }
      }
    );
  };

  const renameFile = (
    fileId: string,
    fileName: string,
    onError?: () => void
  ) => {
    if (!socketRef.current?.connected) {
      showFeedback("Cannot rename this file right now.");
      onError?.();
      return;
    }

    setSyncStatus("syncing");
    socketRef.current.emit(
      "rename-file",
      {
        workspaceId,
        fileId,
        fileName
      },
      (response?: OperationAck) => {
        if (!response?.ok) {
          showFeedback(response?.error?.message ?? "File rename failed.");
          setSyncStatus(socketRef.current?.connected ? "synced" : "connection-lost");
          onError?.();
        }
      }
    );
  };

  const renameWorkspace = (name: string, onError?: () => void) => {
    if (!socketRef.current?.connected) {
      showFeedback("Cannot rename this workspace right now.");
      onError?.();
      return;
    }

    const previousName = workspaceName;
    const optimisticName = name.trim() || "Untitled Workspace";

    setWorkspaceName(optimisticName);
    addRecentWorkspace({
      workspaceId,
      name: optimisticName,
      lastFileName: selectedFile?.fileName
    });
    setSyncStatus("syncing");
    socketRef.current.emit(
      "rename-workspace",
      {
        workspaceId,
        name
      },
      (response?: OperationAck) => {
        if (!response?.ok) {
          setWorkspaceName(previousName);
          addRecentWorkspace({
            workspaceId,
            name: previousName,
            lastFileName: selectedFile?.fileName
          });
          showFeedback(response?.error?.message ?? "Workspace rename failed.");
          setSyncStatus(socketRef.current?.connected ? "synced" : "connection-lost");
          onError?.();
        }
      }
    );
  };

  const deleteFile = (
    fileId: string,
    onComplete: (response?: OperationAck) => void
  ) => {
    if (!socketRef.current?.connected) {
      const error: AppErrorPayload = {
        code: "NOT_CONNECTED",
        message: "Cannot delete a file while disconnected.",
        operation: "delete-file",
        workspaceId,
        fileId
      };
      showFeedback(error.message);
      onComplete({ ok: false, error });
      return;
    }

    setSyncStatus("syncing");
    socketRef.current.emit("delete-file", { workspaceId, fileId }, onComplete);
  };

  const leaveWorkspace = () => {
    intentionalLeaveRef.current = true;
    socketRef.current?.emit("leave-workspace");
    socketRef.current?.disconnect();
    cursorListenerRef.current?.dispose();
    remoteCursorDecorationIdsRef.current = editorRef.current
      ? editorRef.current.deltaDecorations(remoteCursorDecorationIdsRef.current, [])
      : [];
    editorViewStatesRef.current.clear();
    filesRef.current = [];
    currentCursorRef.current = null;
    setCollaborators([]);
    setCursorPosition(null);
    setFiles([]);
    setIsWorkspaceLoaded(false);
    setLocalUserId(null);
    setSelectedFileId(null);
    setSyncStatus("synced");
  };

  const jumpToCollaborator = (collaborator: Collaborator) => {
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

  return {
    collaborators,
    connectionStatus,
    createFile,
    cursorPosition,
    deleteFile,
    feedbackMessage,
    files,
    getAiSelection,
    handleEditorChange,
    handleEditorMount,
    isMonacoReady,
    isWorkspaceLoaded,
    jumpToCollaborator,
    leaveWorkspace,
    localUserId,
    relayoutEditor,
    renameFile,
    renameWorkspace,
    selectedFile,
    selectedFileId,
    selectFile,
    showFeedback,
    syncStatus,
    replaceAiSelection,
    workspaceName,
    workspaceError
  };
}
