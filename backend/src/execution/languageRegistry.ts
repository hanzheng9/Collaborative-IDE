import { getLanguageForFile } from "../language.js";
import type { SupportedExecutionLanguage } from "./executionTypes.js";

export type LanguageRuntime = {
  providerLanguage: SupportedExecutionLanguage;
  supportedLanguage: SupportedExecutionLanguage;
  version: string;
};

const runtimes: Record<SupportedExecutionLanguage, LanguageRuntime> = {
  javascript: {
    providerLanguage: "javascript",
    supportedLanguage: "javascript",
    version: process.env.PISTON_JAVASCRIPT_VERSION ?? "18.15.0"
  },
  python: {
    providerLanguage: "python",
    supportedLanguage: "python",
    version: process.env.PISTON_PYTHON_VERSION ?? "3.10.0"
  },
  typescript: {
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
