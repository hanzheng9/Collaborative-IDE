import type { WorkspaceFile } from "../types";

type FileSidebarProps = {
  files: WorkspaceFile[];
  selectedFileId: string | null;
  onCreateFile: () => void;
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
            <button
              className={
                file.fileId === selectedFileId ? "fileItem active" : "fileItem"
              }
              key={file.fileId}
              title={file.fileName}
              type="button"
              onClick={() => onSelectFile(file.fileId)}
            >
              <span className="fileIcon">{getFileIcon(file.fileName)}</span>
              <span className="fileName">{file.fileName}</span>
            </button>
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
