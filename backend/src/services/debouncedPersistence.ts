type DebouncedSave = {
  fileId: string;
  workspaceId: string;
};

type DebouncedPersistenceOptions = {
  delayMs: number;
  onSave: (workspaceId: string, fileId: string) => Promise<void>;
};

export class DebouncedPersistence {
  private readonly delayMs: number;
  private readonly onSave: (workspaceId: string, fileId: string) => Promise<void>;
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(options: DebouncedPersistenceOptions) {
    this.delayMs = options.delayMs;
    this.onSave = options.onSave;
  }

  schedule({ workspaceId, fileId }: DebouncedSave) {
    this.cancel(workspaceId, fileId);

    this.timers.set(
      this.getKey(workspaceId, fileId),
      setTimeout(() => {
        void this.flush(workspaceId, fileId);
      }, this.delayMs)
    );
  }

  cancel(workspaceId: string, fileId: string) {
    const key = this.getKey(workspaceId, fileId);
    const timer = this.timers.get(key);

    if (timer) {
      clearTimeout(timer);
    }

    this.timers.delete(key);
  }

  async flushAll() {
    const pendingSaves = Array.from(this.timers.keys()).map((key) => {
      const [workspaceId, fileId] = key.split(":");
      return this.flush(workspaceId, fileId);
    });

    await Promise.allSettled(pendingSaves);
  }

  private async flush(workspaceId: string, fileId: string) {
    this.cancel(workspaceId, fileId);
    await this.onSave(workspaceId, fileId);
  }

  private getKey(workspaceId: string, fileId: string) {
    return `${workspaceId}:${fileId}`;
  }
}
