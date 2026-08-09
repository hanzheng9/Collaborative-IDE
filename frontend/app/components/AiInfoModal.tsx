"use client";

import { Modal } from "@carbon/react";
import { useEffect } from "react";

type AiInfoModalProps = {
  onClose: () => void;
};

export function AiInfoModal({ onClose }: AiInfoModalProps) {
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
      modalHeading="AI Assistant Limits"
      open
      passiveModal
      onRequestClose={onClose}
    >
      <div className="aiInfo">
        <section>
          <h3>Current Limits</h3>
          <ul>
            <li>AI works only on selected code, not the full workspace.</li>
            <li>Selected code is limited to about 2,000 characters by default.</li>
            <li>Surrounding context is trimmed to about 1,500 characters.</li>
            <li>Responses are capped at about 400 output tokens by default.</li>
            <li>Requests are limited to 5 per 10 minutes by default.</li>
          </ul>
        </section>

        <section>
          <h3>Why Limits Exist</h3>
          <p>
            The AI assistant is intentionally scoped for small, focused coding
            help. This keeps responses faster, protects your quota, and avoids
            sending more code than necessary.
          </p>
        </section>

        <section>
          <h3>Local Configuration</h3>
          <ul>
            <li>AI_RATE_LIMIT_MAX controls request count.</li>
            <li>AI_RATE_LIMIT_WINDOW_MS controls the rate-limit window.</li>
            <li>AI_MAX_CODE_CHARS controls selected-code size.</li>
            <li>AI_MAX_CONTEXT_CHARS controls surrounding-context size.</li>
            <li>AI_MAX_OUTPUT_TOKENS controls maximum response length.</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
