type LogContext = Record<string, string | number | boolean | null | undefined>;

function writeLog(level: "info" | "warn" | "error", message: string, context: LogContext = {}) {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...context
  };

  const output = JSON.stringify(entry);

  if (level === "error") {
    console.error(output);
    return;
  }

  if (level === "warn") {
    console.warn(output);
    return;
  }

  console.log(output);
}

export const logger = {
  error(message: string, context?: LogContext) {
    writeLog("error", message, context);
  },
  info(message: string, context?: LogContext) {
    writeLog("info", message, context);
  },
  warn(message: string, context?: LogContext) {
    writeLog("warn", message, context);
  }
};
