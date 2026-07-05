"use client";

import Editor, {
  loader,
  type OnChange,
  type OnMount
} from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

type CodeChangePayload = {
  workspaceId: string;
  fileId: string;
  code: string;
};

type WorkspaceFile = {
  fileId: string;
  fileName: string;
  language: string;
  content: string;
};

type WorkspaceStatePayload = {
  workspaceId: string;
  files: WorkspaceFile[];
};

type FileCreatedPayload = {
  workspaceId: string;
  file: WorkspaceFile;
  createdBy: string;
};

type FileRenamedPayload = {
  workspaceId: string;
  file: WorkspaceFile;
};

type CursorPosition = {
  lineNumber: number;
  column: number;
};

type Collaborator = {
  userId: string;
  displayName: string;
  color: string;
  currentFileId: string;
  cursorPosition: CursorPosition | null;
};

type CollaboratorsStatePayload = {
  workspaceId: string;
  collaborators: Collaborator[];
};

const workspaceId = "demo";
const backendUrl = "http://localhost:4000";

function getCollaboratorClassName(userId: string) {
  return `collaborator-${userId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export default function Home() {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const applyingRemoteChangeRef = useRef(false);
  const selectedFileIdRef = useRef<string | null>(null);
  const remoteCursorDecorationIdsRef = useRef<string[]>([]);
  const lineHighlightDecorationIdsRef = useRef<string[]>([]);
  const cursorListenerRef = useRef<{ dispose: () => void } | null>(null);
  const [isMonacoReady, setIsMonacoReady] = useState(false);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [localUserId, setLocalUserId] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

  const selectedFile =
    files.find((file) => file.fileId === selectedFileId) ?? null;

  useEffect(() => {
    selectedFileIdRef.current = selectedFileId;
  }, [selectedFileId]);

  useEffect(() => {
    const socket = io(backendUrl);
    socketRef.current = socket;

    socket.on("connect", () => {
      setLocalUserId(socket.id ?? null);
      socket.emit("join-workspace", { workspaceId });
    });

    socket.on("workspace-state", (payload: WorkspaceStatePayload) => {
      if (payload.workspaceId !== workspaceId) {
        return;
      }

      // Initial sync: load every file from the server before the user edits.
      setFiles(payload.files);
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

      const editor = editorRef.current;
      if (
        !editor ||
        selectedFileIdRef.current !== payload.fileId ||
        editor.getValue() === payload.code
      ) {
        return;
      }

      applyingRemoteChangeRef.current = true;
      editor.setValue(payload.code);
      applyingRemoteChangeRef.current = false;
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
    });

    socket.on("collaborators-state", (payload: CollaboratorsStatePayload) => {
      if (payload.workspaceId !== workspaceId) {
        return;
      }

      setCollaborators(payload.collaborators);
    });

    return () => {
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
    const editor = editorRef.current;

    if (!editor || !selectedFile || editor.getValue() === selectedFile.content) {
      return;
    }

    applyingRemoteChangeRef.current = true;
    editor.setValue(selectedFile.content);
    applyingRemoteChangeRef.current = false;
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
  };

  const handleEditorChange: OnChange = (value) => {
    if (applyingRemoteChangeRef.current || value === undefined) {
      return;
    }

    if (!selectedFileId) {
      return;
    }

    setFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.fileId === selectedFileId ? { ...file, content: value } : file
      )
    );

    socketRef.current?.emit("code-change", {
      workspaceId,
      fileId: selectedFileId,
      code: value
    });
  };

  const handleCreateFile = () => {
    const fileName = window.prompt("New file name", "untitled.ts");

    if (!fileName) {
      return;
    }

    socketRef.current?.emit("create-file", {
      workspaceId,
      fileName
    });
  };

  const handleRenameFile = () => {
    if (!selectedFile) {
      return;
    }

    const fileName = window.prompt("Rename file", selectedFile.fileName);

    if (!fileName || fileName === selectedFile.fileName) {
      return;
    }

    socketRef.current?.emit("rename-file", {
      workspaceId,
      fileId: selectedFile.fileId,
      fileName
    });
  };

  const getFileName = (fileId: string) =>
    files.find((file) => file.fileId === fileId)?.fileName ?? fileId;

  const handleJumpToCollaborator = (collaborator: Collaborator) => {
    const cursorPosition = collaborator.cursorPosition;

    if (!cursorPosition) {
      setSelectedFileId(collaborator.currentFileId);
      return;
    }

    setSelectedFileId(collaborator.currentFileId);

    window.setTimeout(() => {
      const editor = editorRef.current;

      if (!editor) {
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
        lineHighlightDecorationIdsRef.current = editor.deltaDecorations(
          lineHighlightDecorationIdsRef.current,
          []
        );
      }, 1200);
    }, 80);
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
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="Workspace files">
          <div className="sidebarHeader">
            <span>Files</span>
            <button type="button" onClick={handleCreateFile}>
              New
            </button>
          </div>

          <nav className="fileList">
            {files.map((file) => (
              <button
                className={
                  file.fileId === selectedFileId ? "fileItem active" : "fileItem"
                }
                key={file.fileId}
                type="button"
                onClick={() => setSelectedFileId(file.fileId)}
              >
                {file.fileName}
              </button>
            ))}
          </nav>

          <button
            className="renameButton"
            type="button"
            disabled={!selectedFile}
            onClick={handleRenameFile}
          >
            Rename
          </button>

          <div className="collaboratorsPanel">
            <div className="sidebarHeader compact">
              <span>Collaborators</span>
              <span>{collaborators.length}</span>
            </div>

            <div className="collaboratorList">
              {collaborators.map((collaborator) => (
                <button
                  className={
                    collaborator.userId === localUserId
                      ? "collaboratorItem self"
                      : "collaboratorItem"
                  }
                  key={collaborator.userId}
                  type="button"
                  onClick={() => handleJumpToCollaborator(collaborator)}
                >
                  <span
                    className="collaboratorDot"
                    style={{ backgroundColor: collaborator.color }}
                  />
                  <span className="collaboratorText">
                    <span>{collaborator.displayName}</span>
                    <span>{getFileName(collaborator.currentFileId)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="editorShell" aria-label="Code editor">
          {isMonacoReady && selectedFile ? (
            <Editor
              key={`${selectedFile.fileId}-${selectedFile.language}`}
              height="100%"
              defaultLanguage={selectedFile.language}
              defaultValue={selectedFile.content}
              onMount={handleEditorMount}
              onChange={handleEditorChange}
              loading={<div className="editorLoading">Loading editor...</div>}
              theme="vs-dark"
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                wordWrap: "on"
              }}
            />
          ) : (
            <div className="editorLoading">Loading workspace...</div>
          )}
        </section>
      </div>
    </main>
  );
}
