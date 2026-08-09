import { getLanguageForFile } from "../language.js";
import type { SupportedExecutionLanguage } from "./executionTypes.js";

export type LanguageRuntime = {
  judge0LanguageId: number;
  providerLanguage: SupportedExecutionLanguage;
  supportedLanguage: SupportedExecutionLanguage;
  version: string;
};

function getPositiveNumber(value: string | undefined, fallback: number) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

const runtimes: Record<SupportedExecutionLanguage, LanguageRuntime> = {
  javascript: {
    judge0LanguageId: getPositiveNumber(
      process.env.JUDGE0_JAVASCRIPT_LANGUAGE_ID,
      63
    ),
    providerLanguage: "javascript",
    supportedLanguage: "javascript",
    version: process.env.PISTON_JAVASCRIPT_VERSION ?? "18.15.0"
  },
  python: {
    judge0LanguageId: getPositiveNumber(process.env.JUDGE0_PYTHON_LANGUAGE_ID, 71),
    providerLanguage: "python",
    supportedLanguage: "python",
    version: process.env.PISTON_PYTHON_VERSION ?? "3.10.0"
  },
  typescript: {
    judge0LanguageId: getPositiveNumber(
      process.env.JUDGE0_TYPESCRIPT_LANGUAGE_ID,
      74
    ),
    providerLanguage: "typescript",
    supportedLanguage: "typescript",
    version: process.env.PISTON_TYPESCRIPT_VERSION ?? "5.0.3"
  }
};

const supportedLanguageIds = new Set(Object.keys(runtimes));

export function isSupportedExecutionLanguage(
  language: unknown
): language is SupportedExecutionLanguage {
  return typeof language === "string" && supportedLanguageIds.has(language);
}

export function getRuntime(language: SupportedExecutionLanguage) {
  return runtimes[language];
}

export function getExecutionLanguageForFile(
  monacoLanguage: string,
  fileName: string
): SupportedExecutionLanguage | null {
  if (isSupportedExecutionLanguage(monacoLanguage)) {
    return monacoLanguage;
  }

  const languageFromFile = getLanguageForFile(fileName);

  return isSupportedExecutionLanguage(languageFromFile)
    ? languageFromFile
    : null;
}
