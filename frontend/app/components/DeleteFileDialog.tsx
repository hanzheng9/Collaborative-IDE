import { useEffect, useState } from "react";
import type { WorkspaceFile } from "../types";

type DeleteFileDialogProps = {
  file: WorkspaceFile;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteFileDialog({
  file,
  isPending,
  onCancel,
  onConfirm
}: DeleteFileDialogProps) {
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
  }, [file.fileId]);

  return (
    <div
      className="dialogBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) {
          onCancel();
        }
      }}
    >
      <div
        aria-modal="true"
        className="fileDialog"
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !isPending) {
            event.preventDefault();
            onCancel();
          }

          if (event.key === "Enter" && !isPending) {
            event.preventDefault();
            onConfirm();
          }
        }}
      >
        <h2>Delete file</h2>
        <p className="dialogCopy">
          Delete <strong>{file.fileName}</strong>? This removes it from the
          current backend session for everyone in the workspace.
        </p>
        {error ? <p className="dialogError">{error}</p> : null}
        <div className="dialogActions">
          <button type="button" disabled={isPending} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="dangerButton"
            type="button"
            disabled={isPending}
            onClick={() => {
              setError("");
              onConfirm();
            }}
          >
            {isPending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
