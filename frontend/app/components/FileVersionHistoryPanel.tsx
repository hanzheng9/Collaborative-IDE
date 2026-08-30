"use client";

import { Information, Time } from "@carbon/icons-react";
import { Button, Modal } from "@carbon/react";
import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";
import {
  deleteFileVersion,
  getFileVersion,
  listFileVersions,
  saveFileVersion,
  restoreFileVersion,
  type FileVersionContent,
  type FileVersionSummary
} from "../fileVersions";
import type { WorkspaceFile } from "../types";

type FileVersionHistoryPanelProps = {
  isMonacoReady: boolean;
  monacoTheme: "vs" | "vs-dark";
  selectedFile: WorkspaceFile;
  workspaceId: string;
  onClose: () => void;
  onRestored: () => void;
};

function formatVersionTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function FileVersionHistoryPanel({
  isMonacoReady,
  monacoTheme,
  selectedFile,
  workspaceId,
  onClose,
  onRestored
}: FileVersionHistoryPanelProps) {
  const [error, setError] = useState("");
  const [isLoadingVersions, setIsLoadingVersions] = useState(true);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FileVersionSummary | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [isDeletingVersion, setIsDeletingVersion] = useState(false);
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [versionNameDraft, setVersionNameDraft] = useState("");
  const [selectedVersion, setSelectedVersion] =
    useState<FileVersionContent | null>(null);
  const [versions, setVersions] = useState<FileVersionSummary[]>([]);

  useEffect(() => {
    let isMounted = true;

    setError("");
    setIsLoadingVersions(true);
    setSelectedVersion(null);
    listFileVersions(workspaceId, selectedFile.fileId)
      .then((nextVersions) => {
        if (isMounted) {
          setVersions(nextVersions);
        }
      })
      .catch((requestError) => {
        if (isMounted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load version history."
          );
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingVersions(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedFile.fileId, workspaceId]);

  const selectVersion = async (versionId: string) => {
    setError("");
    setIsLoadingPreview(true);

    try {
      setSelectedVersion(
        await getFileVersion(workspaceId, selectedFile.fileId, versionId)
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load this version."
      );
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const confirmSaveVersion = async () => {
    if (versionNameDraft.trim().length > 100) {
      setError("Version names must be 100 characters or less.");
      return;
    }

    setIsSavingVersion(true);
    setError("");

    try {
      const version = await saveFileVersion(
        workspaceId,
        selectedFile.fileId,
        versionNameDraft
      );
      setVersions((currentVersions) => [version, ...currentVersions].slice(0, 50));
      setVersionNameDraft("");
      setIsSaveDialogOpen(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save this version."
      );
    } finally {
      setIsSavingVersion(false);
    }
  };

  const confirmRestore = async () => {
    if (!selectedVersion) {
      return;
    }

    setIsRestoring(true);
    setError("");

    try {
      await restoreFileVersion(
        workspaceId,
        selectedFile.fileId,
        selectedVersion.id
      );
      setIsRestoreDialogOpen(false);
      onRestored();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not restore this version."
      );
    } finally {
      setIsRestoring(false);
    }
  };

  const confirmDeleteVersion = async () => {
    if (!deleteTarget) {
      return;
    }

    setIsDeletingVersion(true);
    setError("");

    try {
      await deleteFileVersion(workspaceId, selectedFile.fileId, deleteTarget.id);
      setVersions((currentVersions) =>
        currentVersions.filter((version) => version.id !== deleteTarget.id)
      );

      if (selectedVersion?.id === deleteTarget.id) {
        setSelectedVersion(null);
      }

      setDeleteTarget(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not delete this version."
      );
    } finally {
      setIsDeletingVersion(false);
    }
  };

  return (
    <aside className="versionPanel" aria-label="File version history">
      <div className="aiPanelHeader">
        <div>
          <h2>Version History</h2>
          <p>{selectedFile.fileName}</p>
        </div>
        <div className="aiPanelHeaderActions">
          <Button
            hasIconOnly
            className="aiPanelHeaderButton"
            iconDescription="Version history information"
            kind="ghost"
            renderIcon={Information}
            size="sm"
            tooltipPosition="left"
            type="button"
            onClick={() => setIsInfoOpen(true)}
          />
          <Button
            className="aiPanelHeaderButton"
            kind="ghost"
            size="sm"
            type="button"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>

      <div className="versionPanelBody">
        <div className="versionActions">
          <Button
            kind="primary"
            size="sm"
            type="button"
            onClick={() => setIsSaveDialogOpen(true)}
          >
            Save Version
          </Button>
        </div>

        <section className="versionList" aria-label="Saved versions">
          {isLoadingVersions ? (
            <div className="aiState" role="status">
              Loading version history...
            </div>
          ) : error && versions.length === 0 ? (
            <div className="aiError" role="alert">
              <p>{error}</p>
            </div>
          ) : versions.length === 0 ? (
            <div className="aiState">
              No saved versions yet. Create a version when you want to preserve
              a checkpoint that you can return to later.
            </div>
          ) : (
            versions.map((version) => (
              <div
                className={
                  selectedVersion?.id === version.id
                    ? "versionItem active"
                    : "versionItem"
                }
                key={version.id}
              >
                <button
                  className="versionSelectButton"
                  type="button"
                  onClick={() => void selectVersion(version.id)}
                >
                  <Time aria-hidden="true" size={16} />
                  <span>
                    <strong>{version.name || "Unnamed version"}</strong>
                    <small>{formatVersionTime(version.createdAt)}</small>
                  </span>
                </button>
                <button
                  aria-label={`Delete ${version.name || "Unnamed version"}`}
                  className="versionDeleteButton"
                  title={`Delete ${version.name || "Unnamed version"}`}
                  type="button"
                  onClick={() => setDeleteTarget(version)}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </section>

        <section className="versionPreview" aria-label="Version preview">
          {isLoadingPreview ? (
            <div className="editorLoading">Loading preview...</div>
          ) : selectedVersion ? (
            <>
              <div className="versionPreviewHeader">
                <span>
                  {(selectedVersion.name || "Unnamed version") +
                    ` from ${formatVersionTime(selectedVersion.createdAt)}`}
                </span>
                <button
                  type="button"
                  onClick={() => setIsRestoreDialogOpen(true)}
                >
                  Restore this version
                </button>
              </div>
              <div className="versionPreviewEditor">
                {isMonacoReady ? (
                  <Editor
                    height="100%"
                    language={selectedFile.language}
                    options={{
                      fontSize: 13,
                      lineNumbersMinChars: 3,
                      minimap: { enabled: false },
                      padding: { top: 10 },
                      readOnly: true,
                      scrollBeyondLastLine: false,
                      wordWrap: "on"
                    }}
                    theme={monacoTheme}
                    value={selectedVersion.content}
                  />
                ) : (
                  <div className="editorLoading">Loading editor...</div>
                )}
              </div>
            </>
          ) : (
            <div className="versionPreviewEmpty">Select a version to preview.</div>
          )}
        </section>

        {error && versions.length > 0 ? (
          <div className="aiError" role="alert">
            <p>{error}</p>
          </div>
        ) : null}
      </div>

      {isSaveDialogOpen ? (
        <Modal
          modalHeading="Save Version"
          open
          primaryButtonDisabled={
            isSavingVersion || versionNameDraft.trim().length > 100
          }
          primaryButtonText={isSavingVersion ? "Saving..." : "Save"}
          secondaryButtonText="Cancel"
          onRequestClose={() => {
            if (!isSavingVersion) {
              setIsSaveDialogOpen(false);
            }
          }}
          onRequestSubmit={confirmSaveVersion}
        >
          <p className="dialogCopy">
            Create a checkpoint of the current contents of {selectedFile.fileName}.
          </p>
          <label className="versionNameField">
            <span>Version name optional</span>
            <input
              autoFocus
              maxLength={100}
              value={versionNameDraft}
              onChange={(event) => setVersionNameDraft(event.target.value)}
            />
          </label>
        </Modal>
      ) : null}

      {isInfoOpen ? (
        <Modal
          modalHeading="Version History"
          open
          passiveModal
          onRequestClose={() => setIsInfoOpen(false)}
        >
          <div className="aiInfo">
            <section>
              <h3>Manual Snapshots</h3>
              <p>
                Version history saves manual checkpoints for the selected file.
                It does not automatically save every live edit.
              </p>
            </section>

            <section>
              <h3>Collaboration Behavior</h3>
              <p>
                Restoring a version updates the live file for everyone in the
                workspace. The version list is not live-synchronized, so close
                and reopen this panel to see versions saved or deleted by other
                collaborators.
              </p>
            </section>

            <section>
              <h3>Safety</h3>
              <p>
                Before restoring different content, the app preserves the
                current file as a Before restore checkpoint.
              </p>
            </section>
          </div>
        </Modal>
      ) : null}

      {isRestoreDialogOpen && selectedVersion ? (
        <Modal
          danger
          modalHeading="Restore this version?"
          open
          primaryButtonDisabled={isRestoring}
          primaryButtonText={isRestoring ? "Restoring..." : "Restore"}
          secondaryButtonText="Cancel"
          onRequestClose={() => {
            if (!isRestoring) {
              setIsRestoreDialogOpen(false);
            }
          }}
          onRequestSubmit={confirmRestore}
        >
          <p className="dialogCopy">
            This will replace the current contents of {selectedFile.fileName} for
            everyone currently in the workspace.
          </p>
          <p className="dialogCopy">
            Your current contents will be preserved as a Before restore version.
          </p>
        </Modal>
      ) : null}

      {deleteTarget ? (
        <Modal
          danger
          modalHeading="Delete this version?"
          open
          primaryButtonDisabled={isDeletingVersion}
          primaryButtonText={isDeletingVersion ? "Deleting..." : "Delete"}
          secondaryButtonText="Cancel"
          onRequestClose={() => {
            if (!isDeletingVersion) {
              setDeleteTarget(null);
            }
          }}
          onRequestSubmit={confirmDeleteVersion}
        >
          <p className="dialogCopy">
            This removes {deleteTarget.name || "this unnamed version"} from the
            history for {selectedFile.fileName}. The live file will not change.
          </p>
        </Modal>
      ) : null}
    </aside>
  );
}
