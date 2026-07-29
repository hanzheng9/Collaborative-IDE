"use client";

import {
  Chat,
  ChevronLeft,
  ChevronRight,
  Play,
  Share,
  StopFilledAlt
} from "@carbon/icons-react";
import { Button, Tag, Theme, ToastNotification } from "@carbon/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import {
  isExecutableLanguage,
  runCode,
  type ExecutionResult
} from "../codeExecution";
import { useCollaborativeWorkspace } from "../hooks/useCollaborativeWorkspace";
import { useThemePreference } from "../hooks/useThemePreference";
import type { WorkspaceFile } from "../types";
import { AiAssistantPanel } from "./AiAssistantPanel";
import { CodeEditor } from "./CodeEditor";
import { CollaboratorList } from "./CollaboratorList";
import { DeleteFileDialog } from "./DeleteFileDialog";
import { EditorTabs } from "./EditorTabs";
import { ExecutionPanel } from "./ExecutionPanel";
import type { BottomPanelTab } from "./ExecutionToolbar";
import { FileDialog } from "./FileDialog";
import { FileSidebar } from "./FileSidebar";
import { StatusBar } from "./StatusBar";
import { ThemeSwitcher } from "./ThemeSwitcher";

type FileDialogState =
  | { mode: "create" }
  | { mode: "rename"; file: WorkspaceFile }
  | null;

type WorkspacePageProps = {
  workspaceId: string;
};

const defaultPanelHeight = 240;
const minExpandedPanelHeight = 120;
const collapsedPanelHeight = 36;
const collapseThreshold = 70;
const panelHeightStorageKey = "collaborativeIde.bottomPanel.height";
const panelCollapsedStorageKey = "collaborativeIde.bottomPanel.collapsed";
const panelTabStorageKey = "collaborativeIde.bottomPanel.tab";
const bottomPanelTabs = new Set<BottomPanelTab>(["input", "output", "terminal"]);

function getSavedPanelHeight() {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage?.getItem !== "function"
  ) {
    return defaultPanelHeight;
  }

  const savedHeight = Number(window.localStorage.getItem(panelHeightStorageKey));

  return Number.isFinite(savedHeight) && savedHeight >= minExpandedPanelHeight
    ? savedHeight
    : defaultPanelHeight;
}

function getSavedCollapsedState() {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage?.getItem !== "function"
  ) {
    return false;
  }

  return window.localStorage.getItem(panelCollapsedStorageKey) === "true";
}

function getSavedPanelTab(): BottomPanelTab {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage?.getItem !== "function"
  ) {
    return "output";
  }

  const savedTab = window.localStorage.getItem(panelTabStorageKey);

  return bottomPanelTabs.has(savedTab as BottomPanelTab)
    ? (savedTab as BottomPanelTab)
    : "output";
}

export function WorkspacePage({ workspaceId }: WorkspacePageProps) {
  const {
    carbonTheme,
    monacoTheme,
    setThemePreference,
    themePreference
  } = useThemePreference();
  const {
    collaborators,
    connectionStatus,
    createFile,
    cursorPosition,
    deleteFile,
    feedbackMessage,
    files,
    getAiSelection,
    handleEditorChange,
    handleEditorMount,
    isMonacoReady,
    isWorkspaceLoaded,
    jumpToCollaborator,
    localUserId,
    relayoutEditor,
    renameFile,
    selectedFile,
    selectedFileId,
    selectFile,
    showFeedback,
    syncStatus,
    replaceAiSelection
  } = useCollaborativeWorkspace(workspaceId);
  const executionAbortRef = useRef<AbortController | null>(null);
  const executionRequestIdRef = useRef(0);
  const editorColumnRef = useRef<HTMLElement | null>(null);
  const previousExpandedPanelHeightRef = useRef(defaultPanelHeight);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(getSavedCollapsedState);
  const [panelHeight, setPanelHeight] = useState(getSavedPanelHeight);
  const [panelTab, setPanelTab] = useState<BottomPanelTab>(getSavedPanelTab);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [executionError, setExecutionError] = useState("");
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(
    null
  );
  const [stdin, setStdin] = useState("");
  const [fileDialog, setFileDialog] = useState<FileDialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceFile | null>(null);
  const [isDeletePending, setIsDeletePending] = useState(false);

  useEffect(() => {
    previousExpandedPanelHeightRef.current = panelHeight;
  }, []);

  const shareWorkspace = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showFeedback("Workspace link copied!");
    } catch {
      showFeedback("Could not copy the workspace link.");
    }
  };

  const handleDeleteFile = () => {
    if (!deleteTarget) {
      return;
    }

    setIsDeletePending(true);
    deleteFile(deleteTarget.fileId, (response) => {
      setIsDeletePending(false);

      if (!response?.ok) {
        showFeedback(response?.error?.message ?? "File deletion failed.");
        return;
      }

      setDeleteTarget(null);
    });
  };

  const getPanelMaxHeight = useCallback(() => {
    const editorColumnHeight =
      editorColumnRef.current?.getBoundingClientRect().height ??
      (typeof window === "undefined" ? defaultPanelHeight : window.innerHeight);

    return Math.max(
      minExpandedPanelHeight,
      Math.floor(editorColumnHeight * 0.6)
    );
  }, []);

  const savePanelPreference = useCallback(
    (nextState: {
      collapsed?: boolean;
      height?: number;
      tab?: BottomPanelTab;
    }) => {
      if (
        typeof window === "undefined" ||
        typeof window.localStorage?.setItem !== "function"
      ) {
        return;
      }

      if (nextState.collapsed !== undefined) {
        window.localStorage.setItem(
          panelCollapsedStorageKey,
          String(nextState.collapsed)
        );
      }

      if (nextState.height !== undefined) {
        window.localStorage.setItem(panelHeightStorageKey, String(nextState.height));
      }

      if (nextState.tab !== undefined) {
        window.localStorage.setItem(panelTabStorageKey, nextState.tab);
      }
    },
    []
  );

  const setExpandedPanelHeight = useCallback(
    (nextHeight: number) => {
      const constrainedHeight = Math.min(
        getPanelMaxHeight(),
        Math.max(minExpandedPanelHeight, Math.round(nextHeight))
      );

      previousExpandedPanelHeightRef.current = constrainedHeight;
      setPanelHeight(constrainedHeight);
      setIsPanelCollapsed(false);
      savePanelPreference({
        collapsed: false,
        height: constrainedHeight
      });
      relayoutEditor();
    },
    [getPanelMaxHeight, relayoutEditor, savePanelPreference]
  );

  const collapsePanel = useCallback(() => {
    previousExpandedPanelHeightRef.current = panelHeight;
    setIsPanelCollapsed(true);
    savePanelPreference({ collapsed: true, height: panelHeight });
    relayoutEditor();
  }, [panelHeight, relayoutEditor, savePanelPreference]);

  const expandPanel = useCallback(() => {
    setExpandedPanelHeight(previousExpandedPanelHeightRef.current || panelHeight);
  }, [panelHeight, setExpandedPanelHeight]);

  const togglePanelCollapsed = useCallback(() => {
    if (isPanelCollapsed) {
      expandPanel();
      return;
    }

    collapsePanel();
  }, [collapsePanel, expandPanel, isPanelCollapsed]);

  const selectPanelTab = useCallback(
    (tab: BottomPanelTab, options: { persist: boolean } = { persist: true }) => {
      setPanelTab(tab);

      if (options.persist) {
        savePanelPreference({ tab });
      }
    },
    [savePanelPreference]
  );

  const startPanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const resizeTarget = event.currentTarget;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const editorColumnRect = editorColumnRef.current?.getBoundingClientRect();

      if (!editorColumnRect) {
        return;
      }

      const nextHeight = editorColumnRect.bottom - moveEvent.clientY;

      if (nextHeight <= collapseThreshold) {
        setIsPanelCollapsed(true);
        savePanelPreference({ collapsed: true });
        relayoutEditor();
        return;
      }

      setExpandedPanelHeight(nextHeight);
    };
    const stopResize = (upEvent: PointerEvent) => {
      resizeTarget.releasePointerCapture(upEvent.pointerId);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
  };

  const handlePanelSeparatorKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>
  ) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setExpandedPanelHeight(panelHeight + 16);
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (panelHeight - 16 <= collapseThreshold) {
        collapsePanel();
        return;
      }

      setExpandedPanelHeight(panelHeight - 16);
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      togglePanelCollapsed();
    }
  };

  const runSelectedFile = useCallback(async () => {
    if (!selectedFile) {
      if (isPanelCollapsed) {
        expandPanel();
      }
      selectPanelTab("output", { persist: false });
      setExecutionError("Select a file before running code.");
      return;
    }

    if (!isExecutableLanguage(selectedFile.language)) {
      if (isPanelCollapsed) {
        expandPanel();
      }
      selectPanelTab("output", { persist: false });
      setExecutionError("This file language is not supported for code execution.");
      return;
    }

    executionAbortRef.current?.abort();
    const abortController = new AbortController();
    executionAbortRef.current = abortController;
    const requestId = executionRequestIdRef.current + 1;
    executionRequestIdRef.current = requestId;

    if (isPanelCollapsed) {
      expandPanel();
    }
    selectPanelTab("output", { persist: false });
    setIsRunningCode(true);
    setExecutionError("");
    setExecutionResult(null);

    try {
      const result = await runCode(
        workspaceId,
        selectedFile,
        files,
        stdin,
        abortController.signal
      );

      if (executionRequestIdRef.current === requestId) {
        setExecutionResult(result);
      }
    } catch (error) {
      if (
        abortController.signal.aborted ||
        executionRequestIdRef.current !== requestId
      ) {
        return;
      }

      setExecutionError(
        error instanceof Error ? error.message : "Code execution failed."
      );
    } finally {
      if (executionRequestIdRef.current === requestId) {
        setIsRunningCode(false);
      }
    }
  }, [
    expandPanel,
    files,
    isPanelCollapsed,
    selectPanelTab,
    selectedFile,
    stdin,
    workspaceId
  ]);

  const stopExecution = () => {
    executionAbortRef.current?.abort();
    executionRequestIdRef.current += 1;
    setIsRunningCode(false);
    setExecutionError("Execution request stopped locally.");
  };

  const clearExecutionOutput = () => {
    setExecutionError("");
    setExecutionResult(null);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void runSelectedFile();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      executionAbortRef.current?.abort();
    };
  }, [runSelectedFile]);

  useEffect(() => {
    relayoutEditor();
  }, [isPanelCollapsed, panelHeight, panelTab, relayoutEditor]);

  return (
    <Theme theme={carbonTheme}>
      <main className="page">
        <header className="topbar">
          <div className="brandCluster">
            <div className="appMark" aria-hidden="true">
              CI
            </div>
            <div>
              <h1>Collaborative IDE</h1>
              <p>
                {selectedFile ? selectedFile.fileName : "No file selected"}
                <span>Workspace {workspaceId}</span>
              </p>
            </div>
          </div>
          <div className="headerMeta" aria-label="Workspace presence">
            <Tag size="sm" type={connectionStatus === "connected" ? "green" : "gray"}>
              {connectionStatus}
            </Tag>
            <Tag size="sm" type={syncStatus === "synced" ? "blue" : "warm-gray"}>
              {syncStatus}
            </Tag>
            <div className="avatarStack" aria-label={`${collaborators.length} collaborators`}>
              {collaborators.slice(0, 4).map((collaborator) => (
                <span
                  className="avatarDot"
                  key={collaborator.userId}
                  title={collaborator.displayName}
                  style={{ backgroundColor: collaborator.color }}
                >
                  {collaborator.displayName.replace("User ", "")}
                </span>
              ))}
            </div>
          </div>
          <div className="topbarActions">
            <Button
              kind="primary"
              renderIcon={Play}
              size="sm"
              type="button"
              onClick={() => void runSelectedFile()}
            >
              Run Code
            </Button>
            <Button
              disabled={!isRunningCode}
              kind="ghost"
              renderIcon={StopFilledAlt}
              size="sm"
              type="button"
              onClick={stopExecution}
            >
              Stop
            </Button>
            <Button
              kind="tertiary"
              renderIcon={Chat}
              size="sm"
              type="button"
              onClick={() => setIsAiPanelOpen(true)}
            >
              Ask AI
            </Button>
            <Button
              kind="secondary"
              renderIcon={Share}
              size="sm"
              type="button"
              onClick={shareWorkspace}
            >
              Share
            </Button>
            <ThemeSwitcher
              value={themePreference}
              onChange={setThemePreference}
            />
          </div>
        </header>

        {feedbackMessage ? (
          <div className="notificationLayer">
            <ToastNotification
              hideCloseButton
              kind="info"
              lowContrast
              role="status"
              subtitle={feedbackMessage}
              timeout={3500}
              title="Workspace update"
            />
          </div>
        ) : null}

        <div
          className={[
            "workspace",
            isAiPanelOpen ? "withAiPanel" : "",
            isSidebarCollapsed ? "sidebarCollapsed" : ""
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <aside className="sidebar" aria-label="Workspace sidebar">
            <button
              aria-label={isSidebarCollapsed ? "Expand file explorer" : "Collapse file explorer"}
              className="sidebarCollapse"
              type="button"
              onClick={() => setIsSidebarCollapsed((current) => !current)}
            >
              {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
            {!isSidebarCollapsed ? (
              <>
                <FileSidebar
                  files={files}
                  selectedFileId={selectedFileId}
                  onDeleteFile={setDeleteTarget}
                  onCreateFile={() => setFileDialog({ mode: "create" })}
                  onRenameFile={() => {
                    if (!selectedFile) {
                      showFeedback("Select a file to rename.");
                      return;
                    }

                    setFileDialog({ mode: "rename", file: selectedFile });
                  }}
                  onSelectFile={selectFile}
                />

                <CollaboratorList
                  collaborators={collaborators}
                  files={files}
                  localUserId={localUserId}
                  onJumpToCollaborator={jumpToCollaborator}
                />
              </>
            ) : null}
          </aside>

          <section
            className={isPanelCollapsed ? "editorColumn panelCollapsed" : "editorColumn"}
            ref={editorColumnRef}
            style={
              {
                "--bottom-panel-height": `${
                  isPanelCollapsed ? collapsedPanelHeight : panelHeight
                }px`
              } as CSSProperties
            }
            aria-label="Code editor"
          >
            <EditorTabs
              files={files}
              selectedFileId={selectedFileId}
              onCloseFile={setDeleteTarget}
              onSelectFile={selectFile}
            />
            <div className="editorShell">
              {!isWorkspaceLoaded && connectionStatus !== "disconnected" ? (
                <div className="editorLoading">Loading workspace...</div>
              ) : (
                <CodeEditor
                  isMonacoReady={isMonacoReady}
                  monacoTheme={monacoTheme}
                  selectedFile={selectedFile}
                  readOnly={connectionStatus !== "connected"}
                  onMount={handleEditorMount}
                  onChange={handleEditorChange}
                />
              )}
            </div>

            <div
              aria-label="Resize lower panel"
              aria-orientation="horizontal"
              aria-valuemax={getPanelMaxHeight()}
              aria-valuemin={collapsedPanelHeight}
              aria-valuenow={isPanelCollapsed ? collapsedPanelHeight : panelHeight}
              className="panelResizeHandle"
              role="separator"
              tabIndex={0}
              title="Drag or use arrow keys to resize lower panel"
              onDoubleClick={togglePanelCollapsed}
              onKeyDown={handlePanelSeparatorKeyDown}
              onPointerDown={startPanelResize}
            >
              <span>Resize lower panel</span>
            </div>

            <ExecutionPanel
              activeTab={panelTab}
              error={executionError}
              isCollapsed={isPanelCollapsed}
              isRunning={isRunningCode}
              result={executionResult}
              stdin={stdin}
              setStdin={setStdin}
              onClear={clearExecutionOutput}
              onRun={() => void runSelectedFile()}
              onStop={stopExecution}
              onTabChange={selectPanelTab}
              onToggleCollapsed={togglePanelCollapsed}
            />
          </section>

          {isAiPanelOpen ? (
            <AiAssistantPanel
              getSelection={getAiSelection}
              onClose={() => setIsAiPanelOpen(false)}
              onReplaceSelection={replaceAiSelection}
            />
          ) : null}
        </div>

        <StatusBar
          collaborators={collaborators}
          connectionStatus={connectionStatus}
          cursorPosition={cursorPosition}
          selectedFile={selectedFile}
          syncStatus={syncStatus}
          workspaceId={workspaceId}
        />

      {fileDialog ? (
        <FileDialog
          files={files}
          initialValue={fileDialog.mode === "rename" ? fileDialog.file.fileName : ""}
          mode={fileDialog.mode}
          onCancel={() => setFileDialog(null)}
          onSubmit={
            fileDialog.mode === "create"
              ? (fileName) => {
                  createFile(fileName, () => setFileDialog({ mode: "create" }));
                  setFileDialog(null);
                }
              : (fileName) => {
                  renameFile(fileDialog.file.fileId, fileName, () =>
                    setFileDialog(fileDialog)
                  );
                  setFileDialog(null);
                }
          }
        />
      ) : null}

      {deleteTarget ? (
        <DeleteFileDialog
          file={deleteTarget}
          isPending={isDeletePending}
          onCancel={() => {
            if (!isDeletePending) {
              setDeleteTarget(null);
            }
          }}
          onConfirm={handleDeleteFile}
        />
      ) : null}
      </main>
    </Theme>
  );
}
