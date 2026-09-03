export type AppConfig = {
  corsOrigin: string;
  corsOrigins: string[];
  databaseUrl?: string;
  port: number;
  rateLimits: {
    aiPerHour: number;
    codeExecutionPerHour: number;
    generalRestPerMinute: number;
    socketConnectionsPerMinute: number;
    workspaceCreatePerHour: number;
  };
  trustProxy: number;
};

function cleanEnvValue(value: string | undefined) {
  const cleaned = value?.trim().replace(/^['"]|['"]$/g, "");
  return cleaned || undefined;
}

function getPositiveNumber(value: string | undefined, fallback: number) {
  const parsedValue = Number(cleanEnvValue(value));
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

export function loadConfig(): AppConfig {
  const corsOrigin = cleanEnvValue(process.env.CORS_ORIGIN)?.replace(/\/+$/, "");
  const databaseUrl = cleanEnvValue(process.env.DATABASE_URL);
  const port = getPositiveNumber(process.env.PORT, 4000);
  const primaryCorsOrigin = corsOrigin || "http://localhost:3000";
  const corsOrigins = [primaryCorsOrigin];

  if (
    process.env.NODE_ENV !== "production" &&
    !corsOrigins.includes("http://localhost:3000")
  ) {
    corsOrigins.push("http://localhost:3000");
  }

  return {
    corsOrigin: primaryCorsOrigin,
    corsOrigins,
    databaseUrl,
    port,
    rateLimits: {
      aiPerHour: getPositiveNumber(
        process.env.RATE_LIMIT_AI_PER_HOUR ?? process.env.AI_RATE_LIMIT_MAX,
        20
      ),
      codeExecutionPerHour: getPositiveNumber(
        process.env.RATE_LIMIT_EXECUTION_PER_HOUR ??
          process.env.EXECUTION_RATE_LIMIT_MAX,
        20
      ),
      generalRestPerMinute: getPositiveNumber(
        process.env.RATE_LIMIT_GENERAL_PER_MINUTE,
        120
      ),
      socketConnectionsPerMinute: getPositiveNumber(
        process.env.RATE_LIMIT_SOCKET_CONNECTIONS_PER_MINUTE,
        40
      ),
      workspaceCreatePerHour: getPositiveNumber(
        process.env.RATE_LIMIT_WORKSPACE_CREATE_PER_HOUR,
        20
      )
    },
    trustProxy: getPositiveNumber(process.env.TRUST_PROXY_HOPS, 1)
  };
}
