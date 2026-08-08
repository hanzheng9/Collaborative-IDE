"use client";

import { Launch, TrashCan } from "@carbon/icons-react";
import {
  Button,
  InlineNotification,
  Modal,
  TextInput,
  Theme
} from "@carbon/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useThemePreference } from "../hooks/useThemePreference";
import {
  clearRecentWorkspaces,
  formatRecentWorkspaceTime,
  getRecentWorkspaces,
  removeRecentWorkspace,
  type RecentWorkspace
} from "../utils/recentWorkspaces";
import {
  createWorkspaceId,
  getWorkspacePath,
  isValidWorkspaceId,
  parseWorkspaceInput
} from "../workspaceRouter";
import { ThemeSwitcher } from "./ThemeSwitcher";

export function WorkspaceLanding() {
  const router = useRouter();
  const { carbonTheme, setThemePreference, themePreference } =
    useThemePreference();
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>([]);
  const [isClearHistoryOpen, setIsClearHistoryOpen] = useState(false);
  const [workspaceInput, setWorkspaceInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setRecentWorkspaces(getRecentWorkspaces());
  }, []);

  const createWorkspace = () => {
    const workspaceId = createWorkspaceId();
    window.sessionStorage.setItem(
      `collaborativeIde.createWorkspace.${workspaceId}`,
      "true"
    );
    router.push(getWorkspacePath(workspaceId));
  };

  const joinWorkspace = () => {
    const workspaceId = parseWorkspaceInput(workspaceInput);

    if (!isValidWorkspaceId(workspaceId)) {
      setError("Enter a valid workspace ID or workspace link.");
      return;
    }

    router.push(getWorkspacePath(workspaceId));
  };

  const openRecentWorkspace = (workspaceId: string) => {
    router.push(getWorkspacePath(workspaceId));
  };

  const removeRecent = (workspaceId: string) => {
    setRecentWorkspaces(removeRecentWorkspace(workspaceId));
  };

  const clearHistory = () => {
    setRecentWorkspaces(clearRecentWorkspaces());
    setIsClearHistoryOpen(false);
  };

  return (
    <Theme theme={carbonTheme}>
      <main className="landingPage">
        <section className="landingPanel" aria-labelledby="landing-title">
          <div className="landingThemeControl">
            <ThemeSwitcher
              value={themePreference}
              onChange={setThemePreference}
            />
          </div>
          <p className="landingEyebrow">Collaborative workspace</p>
          <h1 id="landing-title">Collaborative IDE</h1>

          <Button
            className="primaryButton"
            renderIcon={Launch}
            type="button"
            onClick={createWorkspace}
          >
            Create Workspace
          </Button>

          <form
            className="joinForm"
            onSubmit={(event) => {
              event.preventDefault();
              joinWorkspace();
            }}
          >
            <div className="joinRow">
              <TextInput
                id="workspace-link"
                labelText="Join Existing Workspace"
                placeholder="workspace link or ID"
                value={workspaceInput}
                onChange={(event) => {
                  setWorkspaceInput(event.target.value);
                  setError("");
                }}
              />
              <Button kind="secondary" type="submit">
                Join
              </Button>
            </div>
            {error ? (
              <InlineNotification
                hideCloseButton
                kind="error"
                lowContrast
                title={error}
              />
            ) : null}
          </form>

          {recentWorkspaces.length > 0 ? (
            <section className="recentWorkspaces" aria-labelledby="recent-workspaces-title">
              <div className="recentWorkspacesHeader">
                <h2 id="recent-workspaces-title">Recent Workspaces</h2>
                <Button
                  kind="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setIsClearHistoryOpen(true)}
                >
                  Clear Recent Workspaces
                </Button>
              </div>
              <ul className="recentWorkspaceList">
                {recentWorkspaces.map((workspace) => (
                  <li className="recentWorkspaceItem" key={workspace.workspaceId}>
                    <button
                      aria-label={`Open workspace ${workspace.name}`}
                      className="recentWorkspaceOpen"
                      type="button"
                      onClick={() => openRecentWorkspace(workspace.workspaceId)}
                    >
                      <span className="recentWorkspaceName">{workspace.name}</span>
                      <span className="recentWorkspaceMeta">
                        {workspace.workspaceId}
                        {workspace.lastFileName
                          ? ` / ${workspace.lastFileName}`
                          : ""}
                      </span>
                      <span className="recentWorkspaceMeta">
                        {formatRecentWorkspaceTime(workspace.lastVisitedAt)}
                      </span>
                    </button>
                    <Button
                      hasIconOnly
                      iconDescription={`Remove ${workspace.name} from recent workspaces`}
                      kind="ghost"
                      renderIcon={TrashCan}
                      size="sm"
                      tooltipPosition="left"
                      type="button"
                      onClick={() => removeRecent(workspace.workspaceId)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
        {isClearHistoryOpen ? (
          <Modal
            danger
            modalHeading="Clear recent workspaces?"
            open
            primaryButtonText="Clear History"
            secondaryButtonText="Cancel"
            onRequestClose={() => setIsClearHistoryOpen(false)}
            onRequestSubmit={clearHistory}
          >
            <p className="dialogCopy">
              This only removes browser-local history. It does not delete any
              workspace or file.
            </p>
          </Modal>
        ) : null}
      </main>
    </Theme>
  );
}
