export function qualityIdentity(): string {
  try {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    return "";
  }
}
