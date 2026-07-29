import { InlineNotification, Modal } from "@carbon/react";
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
    <Modal
      danger
      modalHeading="Delete file"
      open
      primaryButtonDisabled={isPending}
      primaryButtonText={isPending ? "Deleting..." : "Delete"}
      secondaryButtonText="Cancel"
      onRequestClose={() => {
        if (!isPending) {
          onCancel();
        }
      }}
      onRequestSubmit={() => {
        setError("");
        onConfirm();
      }}
    >
      <p className="dialogCopy">
        Delete <strong>{file.fileName}</strong>? This removes it from the
        current backend session for everyone in the workspace.
      </p>
      {error ? (
        <InlineNotification hideCloseButton kind="error" lowContrast title={error} />
      ) : null}
    </Modal>
  );
}
