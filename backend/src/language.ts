export function getLanguageForFile(fileName: string) {
  const normalizedName = fileName.toLowerCase();

  if (normalizedName.endsWith(".ts") || normalizedName.endsWith(".tsx")) {
    return "typescript";
  }

  if (normalizedName.endsWith(".js") || normalizedName.endsWith(".jsx")) {
    return "javascript";
  }

  if (normalizedName.endsWith(".py")) {
    return "python";
  }

  if (normalizedName.endsWith(".java")) {
    return "java";
  }

  if (normalizedName.endsWith(".go")) {
    return "go";
  }

  if (normalizedName.endsWith(".c")) {
    return "c";
  }

  if (
    normalizedName.endsWith(".cpp") ||
    normalizedName.endsWith(".cc") ||
    normalizedName.endsWith(".cxx")
  ) {
    return "cpp";
  }

  if (normalizedName.endsWith(".html")) {
    return "html";
  }

  if (normalizedName.endsWith(".css")) {
    return "css";
  }

  if (normalizedName.endsWith(".json")) {
    return "json";
  }

  if (normalizedName.endsWith(".md")) {
    return "markdown";
  }

  if (normalizedName.endsWith(".sql")) {
    return "sql";
  }

  return "plaintext";
}
