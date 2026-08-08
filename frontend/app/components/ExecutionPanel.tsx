import { useMemo } from "react";
import type { ExecutionResult } from "../codeExecution";
import { ExecutionOutput } from "./ExecutionOutput";
import { ExecutionToolbar, type BottomPanelTab } from "./ExecutionToolbar";
import { StdinInput } from "./StdinInput";
import { TerminalView } from "./TerminalView";

type ExecutionPanelProps = {
  activeTab: BottomPanelTab;
  error: string;
  isCollapsed: boolean;
  isRunning: boolean;
  files: { fileName: string }[];
  onClear: () => void;
  onOpenTerminalInfo: () => void;
  onRunTerminalCommand: (command: string) => Promise<string>;
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
  files,
  onClear,
  onOpenTerminalInfo,
  onRun,
  onRunTerminalCommand,
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
        onOpenTerminalInfo={onOpenTerminalInfo}
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
            <TerminalView
              files={files}
              onRunCommand={onRunTerminalCommand}
            />
          ) : (
            <ExecutionOutput error={error} isRunning={isRunning} result={result} />
          )}
        </div>
      ) : null}
    </section>
  );
}
