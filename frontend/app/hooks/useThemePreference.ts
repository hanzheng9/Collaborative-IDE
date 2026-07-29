"use client";

import { useEffect, useMemo, useState } from "react";

export type ThemePreference = "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type CarbonThemeName = "white" | "g100";
export type MonacoThemeName = "vs" | "vs-dark";

const themeStorageKey = "collaborativeIde.theme";
const themePreferences = new Set<ThemePreference>(["light", "dark"]);

function getSystemTheme(): ResolvedTheme {
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
  } catch {
    return "light";
  }

  return "light";
}

function getSavedThemePreference(): ThemePreference {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage?.getItem !== "function"
  ) {
    return "light";
  }

  let savedPreference: string | null = null;

  try {
    savedPreference = window.localStorage.getItem(themeStorageKey);
  } catch {
    return getSystemTheme();
  }

  return themePreferences.has(savedPreference as ThemePreference)
    ? (savedPreference as ThemePreference)
    : getSystemTheme();
}

function persistThemePreference(preference: ThemePreference) {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage?.setItem !== "function"
  ) {
    return;
  }

  try {
    window.localStorage.setItem(themeStorageKey, preference);
  } catch {
    // Theme preference is optional and local-only.
  }
}

export function useThemePreference() {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(
    getSavedThemePreference
  );
  const resolvedTheme = useMemo<ResolvedTheme>(
    () => themePreference,
    [themePreference]
  );

  const carbonTheme: CarbonThemeName =
    resolvedTheme === "dark" ? "g100" : "white";
  const monacoTheme: MonacoThemeName =
    resolvedTheme === "dark" ? "vs-dark" : "vs";

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setThemePreference = (nextPreference: ThemePreference) => {
    setThemePreferenceState(nextPreference);
    persistThemePreference(nextPreference);
  };

  return {
    carbonTheme,
    monacoTheme,
    resolvedTheme,
    setThemePreference,
    themePreference
  };
}
