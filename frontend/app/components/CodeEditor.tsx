import Editor, { type OnChange, type OnMount } from "@monaco-editor/react";
import type { WorkspaceFile } from "../types";

type CodeEditorProps = {
  isMonacoReady: boolean;
  monacoTheme: "vs" | "vs-dark";
  selectedFile: WorkspaceFile | null;
  readOnly: boolean;
  onChange: OnChange;
  onMount: OnMount;
};

export function CodeEditor({
  isMonacoReady,
  monacoTheme,
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
      theme={monacoTheme}
      options={{
        fontSize: 14,
        lineNumbersMinChars: 4,
        minimap: { enabled: false },
        padding: { top: 12 },
        readOnly,
        readOnlyMessage: { value: "Reconnect to continue editing." },
        scrollBeyondLastLine: false,
        wordWrap: "on"
      }}
    />
  );
}
