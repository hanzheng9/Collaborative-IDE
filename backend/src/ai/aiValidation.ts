import { aiActions, type AiAction, type AiAssistRequest } from "./aiTypes.js";

function getPositiveNumber(value: string | undefined, fallback: number) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

export const aiRequestLimits = {
  maxCodeLength: getPositiveNumber(process.env.AI_MAX_CODE_CHARS, 2000),
  maxContextLength: getPositiveNumber(process.env.AI_MAX_CONTEXT_CHARS, 1500)
};

type ValidationResult =
  | { ok: true; request: AiAssistRequest }
  | { ok: false; error: string };

function isAiAction(value: unknown): value is AiAction {
  return typeof value === "string" && aiActions.includes(value as AiAction);
}

function trimOptionalString(value: unknown, maxLength: number) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.slice(0, maxLength);
}

export function validateAiAssistRequest(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

  if (!isAiAction(record.action)) {
    return { ok: false, error: "Unsupported AI action." };
  }

  if (typeof record.code !== "string" || record.code.trim().length === 0) {
    return { ok: false, error: "Select some code before asking AI." };
  }

  const code = record.code.trim();

  if (code.length > aiRequestLimits.maxCodeLength) {
    return {
      ok: false,
      error: `Selected code is too large. Keep it under ${aiRequestLimits.maxCodeLength} characters.`
    };
  }

  const surroundingCode = trimOptionalString(
    record.surroundingCode,
    aiRequestLimits.maxContextLength
  );

  return {
    ok: true,
    request: {
      action: record.action,
      code,
      fileName: trimOptionalString(record.fileName, 240),
      language: trimOptionalString(record.language, 80),
      surroundingCode
    }
  };
}
