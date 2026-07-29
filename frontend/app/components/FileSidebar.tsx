import { Add, Document, Edit, TrashCan } from "@carbon/icons-react";
import { Button } from "@carbon/react";
import type { WorkspaceFile } from "../types";

type FileSidebarProps = {
  files: WorkspaceFile[];
  selectedFileId: string | null;
  onCreateFile: () => void;
  onDeleteFile: (file: WorkspaceFile) => void;
  onRenameFile: () => void;
  onSelectFile: (fileId: string) => void;
};

function getFileIcon(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (!extension || extension === fileName) {
    return "TXT";
  }

  return extension.slice(0, 3).toUpperCase();
}

export function FileSidebar({
  files,
  selectedFileId,
  onCreateFile,
  onDeleteFile,
  onRenameFile,
  onSelectFile
}: FileSidebarProps) {
  return (
    <>
      <div className="sidebarHeader">
        <span>Files</span>
        <Button
          kind="ghost"
          renderIcon={Add}
          size="sm"
          type="button"
          onClick={onCreateFile}
        >
          New
        </Button>
      </div>

      <nav className="fileList" aria-label="Workspace files">
        {files.length === 0 ? (
          <p className="emptyState">No files yet.</p>
        ) : (
          files.map((file) => (
            <div
              className={
                file.fileId === selectedFileId ? "fileRow active" : "fileRow"
              }
              key={file.fileId}
            >
              <button
                className="fileItem"
                title={file.fileName}
                type="button"
                onClick={() => onSelectFile(file.fileId)}
              >
                <span className="fileIcon" aria-hidden="true">
                  <Document size={14} />
                  {getFileIcon(file.fileName)}
                </span>
                <span className="fileName">{file.fileName}</span>
              </button>
              <button
                aria-label={`Delete ${file.fileName}`}
                className="fileDeleteButton"
                title={`Delete ${file.fileName}`}
                type="button"
                onClick={() => onDeleteFile(file)}
              >
                <TrashCan size={14} />
              </button>
            </div>
          ))
        )}
      </nav>

      <Button
        className="renameButton"
        kind="ghost"
        renderIcon={Edit}
        size="sm"
        type="button"
        disabled={!selectedFileId}
        onClick={onRenameFile}
      >
        Rename selected
      </Button>
    </>
  );
}
