import type { ConnectionStatusValue, SyncStatusValue } from "../types";

type ConnectionStatusProps = {
  connectionStatus: ConnectionStatusValue;
  syncStatus: SyncStatusValue;
};

const connectionLabels: Record<ConnectionStatusValue, string> = {
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected",
  reconnecting: "Reconnecting"
};

const syncLabels: Record<SyncStatusValue, string> = {
  synced: "Synced with session",
  syncing: "Syncing",
  unsaved: "Unsynced changes",
  "connection-lost": "Connection lost"
};

export function ConnectionStatus({
  connectionStatus,
  syncStatus
}: ConnectionStatusProps) {
  return (
    <div className="statusGroup" aria-label="Connection and sync status">
      <span className={`statusPill ${connectionStatus}`}>
        {connectionLabels[connectionStatus]}
      </span>
      <span className={`statusPill ${syncStatus}`}>{syncLabels[syncStatus]}</span>
    </div>
  );
}
