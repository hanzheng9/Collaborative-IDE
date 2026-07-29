import { ChevronDown, ChevronUp } from "@carbon/icons-react";

export type BottomPanelTab = "input" | "output" | "terminal";

type ExecutionToolbarProps = {
  activeTab: BottomPanelTab;
  canStop: boolean;
  isCollapsed: boolean;
  onClear: () => void;
  onCopy: () => void;
  onToggleCollapsed: () => void;
  onRun: () => void;
  onStop: () => void;
  onTabChange: (tab: BottomPanelTab) => void;
};

export function ExecutionToolbar({
  activeTab,
  canStop,
  isCollapsed,
  onClear,
  onCopy,
  onRun,
  onStop,
  onTabChange,
  onToggleCollapsed
}: ExecutionToolbarProps) {
  return (
    <div className="executionToolbar">
      <div className="executionTabs" role="tablist" aria-label="Bottom panel">
        <button
          aria-selected={activeTab === "input"}
          className={activeTab === "input" ? "active" : ""}
          role="tab"
          type="button"
          onClick={() => onTabChange("input")}
        >
          Input
        </button>
        <button
          aria-selected={activeTab === "output"}
          className={activeTab === "output" ? "active" : ""}
          role="tab"
          type="button"
          onClick={() => onTabChange("output")}
        >
          Output
        </button>
        <button
          aria-selected={activeTab === "terminal"}
          className={activeTab === "terminal" ? "active" : ""}
          role="tab"
          type="button"
          onClick={() => onTabChange("terminal")}
        >
          Terminal
        </button>
      </div>
      <div className="executionActions">
        <button aria-label="Run code from lower panel" type="button" onClick={onRun}>
          Run Code
        </button>
        <button disabled={!canStop} type="button" onClick={onStop}>
          Stop
        </button>
        <button type="button" onClick={onCopy}>
          Copy
        </button>
        <button type="button" onClick={onClear}>
          Clear
        </button>
        <button
          aria-label={isCollapsed ? "Expand lower panel" : "Collapse lower panel"}
          title={isCollapsed ? "Expand lower panel" : "Collapse lower panel"}
          type="button"
          onClick={onToggleCollapsed}
        >
          {isCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {isCollapsed ? "Expand" : "Collapse"}
        </button>
      </div>
    </div>
  );
}
