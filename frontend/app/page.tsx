"use client";

import Editor, { type OnChange, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

type CodeChangePayload = {
  workspaceId: string;
  fileId: string;
  code: string;
};

const workspaceId = "demo";
const fileId = "main.ts";
const backendUrl = "http://localhost:4000";

const initialCode = `function greet(name: string) {
  return \`Hello, \${name}!\`;
}

console.log(greet("Collaborative IDE"));
`;

export default function Home() {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const applyingRemoteChangeRef = useRef(false);

  useEffect(() => {
    const socket = io(backendUrl);
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-workspace", workspaceId);
    });

    socket.on("code-change", (payload: CodeChangePayload) => {
      if (payload.workspaceId !== workspaceId || payload.fileId !== fileId) {
        return;
      }

      const editor = editorRef.current;
      if (!editor || editor.getValue() === payload.code) {
        return;
      }

      applyingRemoteChangeRef.current = true;
      editor.setValue(payload.code);
      applyingRemoteChangeRef.current = false;
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleEditorChange: OnChange = (value) => {
    if (applyingRemoteChangeRef.current || value === undefined) {
      return;
    }

    socketRef.current?.emit("code-change", {
      workspaceId,
      fileId,
      code: value
    });
  };

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <h1>Collaborative IDE</h1>
          <p>Workspace: {workspaceId} / {fileId}</p>
        </div>
      </header>

      <section className="editorShell" aria-label="Code editor">
        <Editor
          height="100%"
          defaultLanguage="typescript"
          defaultValue={initialCode}
          onMount={handleEditorMount}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            padding: { top: 16 },
            scrollBeyondLastLine: false,
            wordWrap: "on"
          }}
        />
      </section>
    </main>
  );
}
