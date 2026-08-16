function cleanBackendUrl(value: string | undefined) {
  const cleaned = value?.trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
  return cleaned || undefined;
}

export const BACKEND_URL =
  cleanBackendUrl(process.env.NEXT_PUBLIC_BACKEND_URL) ??
  "http://localhost:4000";

export function getBackendUrl(path: string) {
  return `${BACKEND_URL}${path}`;
}
