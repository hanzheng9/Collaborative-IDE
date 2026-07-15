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
        <button type="button" onClick={onCreateFile}>
          New
        </button>
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
                <span className="fileIcon">{getFileIcon(file.fileName)}</span>
                <span className="fileName">{file.fileName}</span>
              </button>
              <button
                aria-label={`Delete ${file.fileName}`}
                className="fileDeleteButton"
                title={`Delete ${file.fileName}`}
                type="button"
                onClick={() => onDeleteFile(file)}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </nav>

      <button
        className="renameButton"
        type="button"
        disabled={!selectedFileId}
        onClick={onRenameFile}
      >
        Rename selected
      </button>
    </>
  );
}
