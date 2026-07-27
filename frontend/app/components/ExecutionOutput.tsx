import {
  getExecutionStatusLabel,
  type ExecutionResult
} from "../codeExecution";

type ExecutionOutputProps = {
  error: string;
  isRunning: boolean;
  result: ExecutionResult | null;
};

export function ExecutionOutput({
  error,
  isRunning,
  result
}: ExecutionOutputProps) {
  if (isRunning) {
    return <pre className="executionOutput">Running...</pre>;
  }

  if (error) {
    return <pre className="executionOutput errorOutput">{error}</pre>;
  }

  if (!result) {
    return <pre className="executionOutput">Run code to see output.</pre>;
  }

  const lines = [
    getExecutionStatusLabel(result.status),
    result.durationMs !== undefined ? `Duration: ${result.durationMs}ms` : "",
    result.exitCode !== undefined ? `Exit code: ${result.exitCode}` : "",
    result.signal ? `Signal: ${result.signal}` : "",
    result.compileOutput ? `\nCompilation output:\n${result.compileOutput}` : "",
    result.stdout ? `\nStandard output:\n${result.stdout}` : "",
    result.stderr ? `\nStandard error:\n${result.stderr}` : ""
  ].filter(Boolean);

  return <pre className="executionOutput">{lines.join("\n")}</pre>;
}
