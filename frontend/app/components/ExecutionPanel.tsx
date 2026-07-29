import { useMemo } from "react";
import type { ExecutionResult } from "../codeExecution";
import { ExecutionOutput } from "./ExecutionOutput";
import { ExecutionToolbar, type BottomPanelTab } from "./ExecutionToolbar";
import { StdinInput } from "./StdinInput";

type ExecutionPanelProps = {
  activeTab: BottomPanelTab;
  error: string;
  isCollapsed: boolean;
  isRunning: boolean;
  onClear: () => void;
  onTabChange: (tab: BottomPanelTab) => void;
  onToggleCollapsed: () => void;
  onRun: () => void;
  onStop: () => void;
  result: ExecutionResult | null;
  stdin: string;
  setStdin: (value: string) => void;
};

export function ExecutionPanel({
  activeTab,
  error,
  isCollapsed,
  isRunning,
  onClear,
  onRun,
  onStop,
  onTabChange,
  onToggleCollapsed,
  result,
  setStdin,
  stdin
}: ExecutionPanelProps) {
  const outputText = useMemo(
    () =>
      [
        result?.compileOutput,
        result?.stdout,
        result?.stderr,
        error
      ]
        .filter(Boolean)
        .join("\n"),
    [error, result]
  );

  const copyOutput = async () => {
    await navigator.clipboard.writeText(outputText);
  };

  return (
    <section className="executionPanel" aria-label="Lower panel">
      <ExecutionToolbar
        activeTab={activeTab}
        canStop={isRunning}
        isCollapsed={isCollapsed}
        onClear={onClear}
        onCopy={copyOutput}
        onRun={onRun}
        onStop={onStop}
        onTabChange={onTabChange}
        onToggleCollapsed={onToggleCollapsed}
      />
      {!isCollapsed ? (
        <div className="executionPanelBody">
          {activeTab === "input" ? (
            <StdinInput value={stdin} onChange={setStdin} />
          ) : activeTab === "terminal" ? (
            <ExecutionOutput error={error} isRunning={isRunning} result={result} />
          ) : (
            <ExecutionOutput error={error} isRunning={isRunning} result={result} />
          )}
        </div>
      ) : null}
    </section>
  );
}
