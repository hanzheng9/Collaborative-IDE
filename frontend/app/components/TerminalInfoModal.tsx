"use client";

import { Modal } from "@carbon/react";
import { useEffect } from "react";

type TerminalInfoModalProps = {
  onClose: () => void;
};

export function TerminalInfoModal({ onClose }: TerminalInfoModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <Modal
      modalHeading="Terminal Capabilities"
      open
      passiveModal
      onRequestClose={onClose}
    >
      <div className="terminalInfo">
        <section>
          <h3>Supported Features</h3>
          <ul>
            <li>Running supported languages: python, python3, node, npx tsx</li>
            <li>Command history with Up and Down arrow keys</li>
            <li>Clear terminal with clear</li>
            <li>Basic filesystem inspection with ls and pwd</li>
            <li>Standard input, output, error messages, and exit status</li>
          </ul>
          <pre>{`python main.py
python3 main.py
node main.js
npx tsx main.ts`}</pre>
        </section>

        <section>
          <h3>Current Limitations</h3>
          <p>
            Commands execute in an isolated execution environment. Each command
            runs independently. The terminal does not currently maintain a
            persistent shell session.
          </p>
          <ul>
            <li>Working directory is reset after each command</li>
            <li>cd is not persistent</li>
            <li>Package installation is disabled</li>
            <li>Environment variables are unavailable</li>
            <li>Git commands are unavailable</li>
            <li>Terminal history is local to your browser</li>
            <li>Terminal output is not shared with collaborators</li>
          </ul>
        </section>

        <section>
          <h3>Planned Improvements</h3>
          <ul>
            <li>Persistent shell sessions</li>
            <li>Better filesystem navigation</li>
            <li>Additional language runtimes</li>
            <li>Expanded command support</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
