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
    <div
      className="dialogBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <form
        className="fileDialog"
        onSubmit={(event) => {
          event.preventDefault();
          validateAndSubmit();
        }}
      >
        <h2>{title}</h2>
        <label htmlFor={inputId}>Filename</label>
        <input
          autoFocus
          id={inputId}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
          placeholder="main.ts"
        />
        {error ? <p className="dialogError">{error}</p> : null}
        <div className="dialogActions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit">{actionLabel}</button>
        </div>
      </form>
    </div>
  );
}
