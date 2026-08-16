type MonacoWorkerEnvironment = {
  getWorker: (_moduleId: string, label: string) => Worker;
};

const workerEnvironment = globalThis as typeof globalThis & {
  MonacoEnvironment?: MonacoWorkerEnvironment;
};

let configured = false;

export function configureMonacoWorkers() {
  if (typeof window === "undefined" || configured) {
    return;
  }

  configured = true;
  workerEnvironment.MonacoEnvironment = {
    getWorker(_moduleId, label) {
      if (label === "typescript" || label === "javascript") {
        return new Worker(
          new URL(
            "monaco-editor/esm/vs/language/typescript/ts.worker.js",
            import.meta.url
          ),
          { name: `monaco-${label}-worker`, type: "module" }
        );
      }

      return new Worker(
        new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url),
        { name: "monaco-editor-worker", type: "module" }
      );
    }
  };
}
