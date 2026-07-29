import { InlineNotification, Modal, TextInput } from "@carbon/react";
import { useEffect, useId, useState } from "react";
import type { WorkspaceFile } from "../types";

type FileDialogMode = "create" | "rename";

type FileDialogProps = {
  files: WorkspaceFile[];
  initialValue?: string;
  mode: FileDialogMode;
  onCancel: () => void;
  onSubmit: (fileName: string) => void;
};

export function FileDialog({
  files,
  initialValue = "",
  mode,
  onCancel,
  onSubmit
}: FileDialogProps) {
  const inputId = useId();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(initialValue);
    setError("");
  }, [initialValue]);

  const title = mode === "create" ? "Create file" : "Rename file";
  const actionLabel = mode === "create" ? "Create" : "Rename";

  const validateAndSubmit = () => {
    const trimmedValue = value.trim();
    const duplicateFile = files.some(
      (file) =>
        file.fileName.toLowerCase() === trimmedValue.toLowerCase() &&
        file.fileName.toLowerCase() !== initialValue.trim().toLowerCase()
    );

    if (!trimmedValue) {
      setError("Filename is required.");
      return;
    }

    if (duplicateFile) {
      setError("A file with that name already exists.");
      return;
    }

    onSubmit(trimmedValue);
  };

  return (
    <Modal
      modalHeading={title}
      open
      primaryButtonText={actionLabel}
      secondaryButtonText="Cancel"
      selectorPrimaryFocus={`#${inputId}`}
      onRequestClose={onCancel}
      onRequestSubmit={validateAndSubmit}
    >
      <form
        className="modalForm"
        onSubmit={(event) => {
          event.preventDefault();
          validateAndSubmit();
        }}
      >
        <TextInput
          autoFocus
          id={inputId}
          labelText="Filename"
          placeholder="main.ts"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
        />
        {error ? (
          <InlineNotification
            hideCloseButton
            kind="error"
            lowContrast
            title={error}
          />
        ) : null}
      </form>
    </Modal>
  );
}
