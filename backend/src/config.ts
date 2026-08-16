export type AppConfig = {
  corsOrigin: string;
  databaseUrl?: string;
  port: number;
};

function cleanEnvValue(value: string | undefined) {
  const cleaned = value?.trim().replace(/^['"]|['"]$/g, "");
  return cleaned || undefined;
}

export function loadConfig(): AppConfig {
  const corsOrigin = cleanEnvValue(process.env.CORS_ORIGIN)?.replace(/\/+$/, "");
  const databaseUrl = cleanEnvValue(process.env.DATABASE_URL);
  const port = Number(cleanEnvValue(process.env.PORT) ?? 4000);

  return {
    corsOrigin: corsOrigin || "http://localhost:3000",
    databaseUrl,
    port: Number.isFinite(port) ? port : 4000
  };
}
