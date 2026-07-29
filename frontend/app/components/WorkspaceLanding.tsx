"use client";

import { Launch } from "@carbon/icons-react";
import { Button, InlineNotification, TextInput, Theme } from "@carbon/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useThemePreference } from "../hooks/useThemePreference";
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
  const [workspaceInput, setWorkspaceInput] = useState("");
  const [error, setError] = useState("");

  const createWorkspace = () => {
    router.push(getWorkspacePath(createWorkspaceId()));
  };

  const joinWorkspace = () => {
    const workspaceId = parseWorkspaceInput(workspaceInput);

    if (!isValidWorkspaceId(workspaceId)) {
      setError("Enter a valid workspace ID or workspace link.");
      return;
    }

    router.push(getWorkspacePath(workspaceId));
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
        </section>
      </main>
    </Theme>
  );
}
