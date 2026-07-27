"use client";

import { useEffect, useRef, useState } from "react";
import {
  aiActionLabels,
  extractReplacementCode,
  requestAiAssist,
  type AiAction,
  type AiAssistResult
} from "../aiAssistant";
import type { AiCodeSelection } from "../hooks/useCollaborativeWorkspace";
import { AiActionToolbar } from "./AiActionToolbar";
import { AiResultView } from "./AiResultView";

type AiAssistantPanelProps = {
  getSelection: () => AiCodeSelection | null;
  onClose: () => void;
  onReplaceSelection: (
    selection: AiCodeSelection,
    replacementCode: string
  ) => { ok: true } | { ok: false; error: string };
};

export function AiAssistantPanel({
  getSelection,
  onClose,
  onReplaceSelection
}: AiAssistantPanelProps) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const [activeAction, setActiveAction] = useState<AiAction | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastAction, setLastAction] = useState<AiAction | null>(null);
  const [result, setResult] = useState<AiAssistResult | null>(null);
  const [selection, setSelection] = useState<AiCodeSelection | null>(() =>
    getSelection()
  );

  const replacementCode = result ? extractReplacementCode(result.result) : "";
  const canReplace =
    Boolean(replacementCode) && result?.action !== "explain" && selection !== null;
  const visibleAction = lastAction ?? activeAction;
  const loadingMessage = visibleAction
    ? `Asking AI to ${aiActionLabels[visibleAction].toLowerCase()}...`
    : "Asking AI...";

  const runAction = async (action: AiAction) => {
    setActiveAction(action);
    setIsLoading(true);
    setLastAction(action);
    setError("");
    setResult(null);

    const currentSelection = getSelection() ?? selection;

    if (!currentSelection) {
      setIsLoading(false);
      setActiveAction(null);
      setSelection(null);
      setResult(null);
      setError("Select some code in the editor to use the AI assistant.");
      return;
    }

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setSelection(currentSelection);

    try {
      const nextResult = await requestAiAssist(
        action,
        currentSelection,
        abortController.signal
      );

      if (requestIdRef.current === requestId) {
        setResult(nextResult);
      }
    } catch (requestError) {
      if (abortController.signal.aborted || requestIdRef.current !== requestId) {
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "AI assistant request failed."
      );
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
        setActiveAction(null);
      }
    }
  };

  const retry = () => {
    if (lastAction) {
      void runAction(lastAction);
    }
  };

  const copyResult = async () => {
    if (!result) {
      return;
    }

    try {
      await navigator.clipboard.writeText(result.result);
      setError("");
    } catch {
      setError("Could not copy the AI response.");
    }
  };

  const replaceSelection = () => {
    if (!selection || !replacementCode) {
      return;
    }

    const response = onReplaceSelection(selection, replacementCode);

    if (!response.ok) {
      setError(response.error);
    }
  };

  useEffect(() => {
    if (!selection) {
      setError("Select some code in the editor to use the AI assistant.");
    }
  }, [selection]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return (
    <aside className="aiPanel" aria-label="AI coding assistant">
      <div className="aiPanelHeader">
        <div>
          <h2>AI Assistant</h2>
          <p>{selection ? selection.fileName : "No code selected"}</p>
        </div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <AiActionToolbar
        activeAction={activeAction}
        disabled={isLoading}
        onAction={runAction}
        onActionStart={(action) => {
          setActiveAction(action);
          setLastAction(action);
          setError("");
          setResult(null);
        }}
      />

      {isLoading ? (
        <div className="aiState" role="status">
          {loadingMessage}
        </div>
      ) : activeAction ? (
        <div className="aiState" role="status">
          Starting {aiActionLabels[activeAction]}...
        </div>
      ) : error ? (
        <div className="aiError" role="alert">
          <p>{error}</p>
          {lastAction ? (
            <button type="button" onClick={retry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : result ? (
        <>
          <div className="aiResultHeader">
            <span>{aiActionLabels[result.action]}</span>
            <div>
              <button type="button" onClick={copyResult}>
                Copy
              </button>
              {canReplace ? (
                <button type="button" onClick={replaceSelection}>
                  Replace Selection
                </button>
              ) : null}
            </div>
          </div>
          <AiResultView result={result.result} />
        </>
      ) : (
        <div className="aiState">Choose an action for the selected code.</div>
      )}
    </aside>
  );
}
