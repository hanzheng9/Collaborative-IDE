type ExecutionToolbarProps = {
  activeTab: "input" | "output";
  canStop: boolean;
  onClear: () => void;
  onCopy: () => void;
  onRun: () => void;
  onStop: () => void;
  onTabChange: (tab: "input" | "output") => void;
};

export function ExecutionToolbar({
  activeTab,
  canStop,
  onClear,
  onCopy,
  onRun,
  onStop,
  onTabChange
}: ExecutionToolbarProps) {
  return (
    <div className="executionToolbar">
      <div className="executionTabs">
        <button
          className={activeTab === "output" ? "active" : ""}
          type="button"
          onClick={() => onTabChange("output")}
        >
          Output
        </button>
        <button
          className={activeTab === "input" ? "active" : ""}
          type="button"
          onClick={() => onTabChange("input")}
        >
          Input
        </button>
      </div>
      <div className="executionActions">
        <button type="button" onClick={onRun}>
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
      </div>
    </div>
  );
}
