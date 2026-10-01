export function normalizeDisplayName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
