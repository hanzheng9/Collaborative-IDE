import { aiActionLabels, aiActions, type AiAction } from "../aiAssistant";

type AiActionToolbarProps = {
  activeAction: AiAction | null;
  disabled: boolean;
  onAction: (action: AiAction) => void;
  onActionStart: (action: AiAction) => void;
};

export function AiActionToolbar({
  activeAction,
  disabled,
  onAction,
  onActionStart
}: AiActionToolbarProps) {
  return (
    <div className="aiActionToolbar" aria-label="AI actions">
      {aiActions.map((action) => (
        <button
          disabled={disabled}
          key={action}
          type="button"
          onPointerDown={() => onActionStart(action)}
          onClick={() => onAction(action)}
        >
          {activeAction === action
            ? `${aiActionLabels[action]}...`
            : aiActionLabels[action]}
        </button>
      ))}
    </div>
  );
}
