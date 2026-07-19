export type AppConfig = {
  corsOrigin: string;
  databaseUrl?: string;
  port: number;
};

export function loadConfig(): AppConfig {
  return {
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    databaseUrl: process.env.DATABASE_URL,
    port: Number(process.env.PORT ?? 4000)
  };
}
