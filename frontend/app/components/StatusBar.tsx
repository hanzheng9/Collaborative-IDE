import { CircleFilled, Code, Group, Location } from "@carbon/icons-react";
import type {
  Collaborator,
  ConnectionStatusValue,
  CursorPosition,
  SyncStatusValue,
  WorkspaceFile
} from "../types";

type StatusBarProps = {
  collaborators: Collaborator[];
  connectionStatus: ConnectionStatusValue;
  cursorPosition: CursorPosition | null;
  selectedFile: WorkspaceFile | null;
  syncStatus: SyncStatusValue;
  workspaceId: string;
};

const connectionLabels: Record<ConnectionStatusValue, string> = {
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected",
  reconnecting: "Reconnecting",
  "reconnection-failed": "Reconnection failed"
};

const syncLabels: Record<SyncStatusValue, string> = {
  synced: "Synced",
  syncing: "Syncing",
  unsaved: "Unsaved changes",
  "connection-lost": "Connection lost"
};

function getStatusTone(connectionStatus: ConnectionStatusValue) {
  if (connectionStatus === "connected") {
    return "connected";
  }

  if (connectionStatus === "connecting" || connectionStatus === "reconnecting") {
    return "pending";
  }

  return "offline";
}

export function StatusBar({
  collaborators,
  connectionStatus,
  cursorPosition,
  selectedFile,
  syncStatus,
  workspaceId
}: StatusBarProps) {
  return (
    <footer className="statusBar" aria-live="polite">
      <span className={`statusBarItem ${getStatusTone(connectionStatus)}`}>
        <CircleFilled size={10} />
        {connectionLabels[connectionStatus]}
      </span>
      <span className="statusBarItem">{syncLabels[syncStatus]}</span>
      <span className="statusBarItem">
        <Code size={14} />
        {selectedFile ? selectedFile.language : "No language"}
      </span>
      <span className="statusBarItem">
        <Location size={14} />
        {cursorPosition
          ? `Ln ${cursorPosition.lineNumber}, Col ${cursorPosition.column}`
          : "No cursor"}
      </span>
      <span className="statusBarItem">
        <Group size={14} />
        {collaborators.length} collaborators
      </span>
      <span className="statusBarItem subtle">Workspace {workspaceId}</span>
    </footer>
  );
}
