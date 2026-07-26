"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createWorkspaceId,
  getWorkspacePath,
  isValidWorkspaceId,
  parseWorkspaceInput
} from "../workspaceRouter";

export function WorkspaceLanding() {
  const router = useRouter();
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
    <main className="landingPage">
      <section className="landingPanel" aria-labelledby="landing-title">
        <h1 id="landing-title">Collaborative IDE</h1>

        <button className="primaryButton" type="button" onClick={createWorkspace}>
          Create Workspace
        </button>

        <form
          className="joinForm"
          onSubmit={(event) => {
            event.preventDefault();
            joinWorkspace();
          }}
        >
          <label htmlFor="workspace-link">Join Existing Workspace</label>
          <div className="joinRow">
            <input
              id="workspace-link"
              placeholder="workspace link or ID"
              value={workspaceInput}
              onChange={(event) => {
                setWorkspaceInput(event.target.value);
                setError("");
              }}
            />
            <button type="submit">Join</button>
          </div>
          {error ? <p className="landingError">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
