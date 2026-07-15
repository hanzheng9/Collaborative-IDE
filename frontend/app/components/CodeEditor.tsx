import Editor, { type OnChange, type OnMount } from "@monaco-editor/react";
import type { WorkspaceFile } from "../types";

type CodeEditorProps = {
  isMonacoReady: boolean;
  selectedFile: WorkspaceFile | null;
  readOnly: boolean;
  onChange: OnChange;
  onMount: OnMount;
};

export function CodeEditor({
  isMonacoReady,
  selectedFile,
  readOnly,
  onChange,
  onMount
}: CodeEditorProps) {
  if (!isMonacoReady) {
    return <div className="editorLoading">Loading editor...</div>;
  }

  if (!selectedFile) {
    return (
      <div className="editorLoading">
        Select or create a file to start editing.
      </div>
    );
  }

  return (
    <Editor
      key={`${selectedFile.fileId}-${selectedFile.language}`}
      height="100%"
      defaultLanguage={selectedFile.language}
      defaultValue={selectedFile.content}
      onMount={onMount}
      onChange={onChange}
      loading={<div className="editorLoading">Loading editor...</div>}
      theme="vs-dark"
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        padding: { top: 16 },
        readOnly,
        readOnlyMessage: { value: "Reconnect to continue editing." },
        scrollBeyondLastLine: false,
        wordWrap: "on"
      }}
    />
  );
}
