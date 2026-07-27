import { useMemo, useState } from "react";
import type { ExecutionResult } from "../codeExecution";
import { ExecutionOutput } from "./ExecutionOutput";
import { ExecutionToolbar } from "./ExecutionToolbar";
import { StdinInput } from "./StdinInput";

type ExecutionPanelProps = {
  error: string;
  isRunning: boolean;
  onClear: () => void;
  onRun: () => void;
  onStop: () => void;
  result: ExecutionResult | null;
  stdin: string;
  setStdin: (value: string) => void;
};

export function ExecutionPanel({
  error,
  isRunning,
  onClear,
  onRun,
  onStop,
  result,
  setStdin,
  stdin
}: ExecutionPanelProps) {
  const [activeTab, setActiveTab] = useState<"input" | "output">("output");
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
    <section className="executionPanel" aria-label="Code execution output">
      <ExecutionToolbar
        activeTab={activeTab}
        canStop={isRunning}
        onClear={onClear}
        onCopy={copyOutput}
        onRun={onRun}
        onStop={onStop}
        onTabChange={setActiveTab}
      />
      {activeTab === "input" ? (
        <StdinInput value={stdin} onChange={setStdin} />
      ) : (
        <ExecutionOutput error={error} isRunning={isRunning} result={result} />
      )}
    </section>
  );
}
