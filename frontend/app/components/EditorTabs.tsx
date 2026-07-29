import { Close } from "@carbon/icons-react";
import type { WorkspaceFile } from "../types";

type EditorTabsProps = {
  files: WorkspaceFile[];
  selectedFileId: string | null;
  onCloseFile: (file: WorkspaceFile) => void;
  onSelectFile: (fileId: string) => void;
};

function getLanguageLabel(language: string) {
  return language.charAt(0).toUpperCase() + language.slice(1);
}

export function EditorTabs({
  files,
  selectedFileId,
  onCloseFile,
  onSelectFile
}: EditorTabsProps) {
  return (
    <div className="editorTabs" role="tablist" aria-label="Open files">
      {files.map((file) => {
        const isActive = file.fileId === selectedFileId;

        return (
          <div className={isActive ? "editorTab active" : "editorTab"} key={file.fileId}>
            <button
              aria-selected={isActive}
              className="editorTabButton"
              role="tab"
              title={`${file.fileName} - ${getLanguageLabel(file.language)}`}
              type="button"
              onClick={() => onSelectFile(file.fileId)}
            >
              <span className="editorTabName">{file.fileName}</span>
            </button>
            <button
              aria-label={`Close tab and delete ${file.fileName}`}
              className="editorTabClose"
              title={`Close tab and delete ${file.fileName}`}
              type="button"
              onClick={() => onCloseFile(file)}
            >
              <Close size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
