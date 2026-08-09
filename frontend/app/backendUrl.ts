export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export function getBackendUrl(path: string) {
  return `${BACKEND_URL}${path}`;
}
