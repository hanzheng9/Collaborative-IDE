import { Moon, Sun } from "@carbon/icons-react";
import { Button } from "@carbon/react";
import type { ThemePreference } from "../hooks/useThemePreference";

type ThemeSwitcherProps = {
  onChange: (themePreference: ThemePreference) => void;
  value: ThemePreference;
};

function getNextThemePreference(currentPreference: ThemePreference) {
  return currentPreference === "dark" ? "light" : "dark";
}

function getThemeIcon(themePreference: ThemePreference) {
  if (themePreference === "light") {
    return Sun;
  }

  if (themePreference === "dark") {
    return Moon;
  }

  return Sun;
}

function getThemeLabel(themePreference: ThemePreference) {
  if (themePreference === "light") {
    return "Light";
  }

  if (themePreference === "dark") {
    return "Dark";
  }

  return "Light";
}

export function ThemeSwitcher({ onChange, value }: ThemeSwitcherProps) {
  const Icon = getThemeIcon(value);
  const label = getThemeLabel(value);

  return (
    <Button
      aria-label={`Theme: ${label}. Switch theme`}
      className="themeSwitcher"
      kind="ghost"
      renderIcon={Icon}
      size="sm"
      title={`Theme: ${label}. Click to switch theme.`}
      type="button"
      onClick={() => onChange(getNextThemePreference(value))}
    >
      {label}
    </Button>
  );
}
