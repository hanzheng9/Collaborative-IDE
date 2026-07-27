import type { AiCodeSelection } from "./hooks/useCollaborativeWorkspace";

export const aiActions = ["explain", "refactor", "fix", "tests", "optimize"] as const;

export type AiAction = (typeof aiActions)[number];

export const aiActionLabels: Record<AiAction, string> = {
  explain: "Explain",
  fix: "Fix Bug",
  optimize: "Optimize",
  refactor: "Refactor",
  tests: "Generate Tests"
};

export type AiAssistResult = {
  action: AiAction;
  result: string;
};

export async function requestAiAssist(
  action: AiAction,
  selection: AiCodeSelection,
  signal: AbortSignal
) {
  const response = await fetch("http://localhost:4000/api/ai/assist", {
    body: JSON.stringify({
      action,
      code: selection.code,
      fileName: selection.fileName,
      language: selection.language,
      surroundingCode: selection.surroundingCode
    }),
    credentials: "omit",
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST",
    signal
  });
  const body = (await response.json()) as Partial<AiAssistResult> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "AI assistant request failed.");
  }

  if (!body.result || !body.action) {
    throw new Error("AI assistant returned an empty response.");
  }

  return {
    action: body.action,
    result: body.result
  } satisfies AiAssistResult;
}

export function extractReplacementCode(markdown: string) {
  const match = markdown.match(/```(?:[\w.+-]+)?\n([\s\S]*?)```/);
  return match?.[1]?.trim() ?? "";
}
