import {
  ADDRESS_SEARCH_MESSAGE,
  isAddressSearchPage,
  type AddressSearchErrorCode,
  type AddressSearchResult,
} from "./address-search";

const ENDPOINT = "/api/v1/address/search";
const MAX_QUERY_LENGTH = 80;
const MAX_PAGE = 100;

const ERROR_BY_STATUS: Record<number, AddressSearchErrorCode> = {
  400: "INVALID_INPUT",
  429: "RATE_LIMITED",
  503: "NOT_CONFIGURED",
};

const failure = (code: AddressSearchErrorCode): AddressSearchResult => ({
  ok: false,
  code,
});

/** Only extension pages may search; a content script's sender URL is the visited page. */
export function createAddressSearchHandler({
  baseUrl,
  extensionId,
  fetcher = (input, init) => fetch(input, init),
  timeoutMs = 10_000,
}: {
  baseUrl: string | undefined;
  extensionId: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}) {
  const normalizedBaseUrl = baseUrl?.trim().replace(/\/$/, "") ?? "";
  const pageOrigin = `chrome-extension://${extensionId}/`;

  async function run(query: string, page: number) {
    if (!normalizedBaseUrl) return failure("NOT_CONFIGURED");
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${normalizedBaseUrl}${ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, page }),
        signal: controller.signal,
      });
      if (!response.ok)
        return failure(ERROR_BY_STATUS[response.status] ?? "UNAVAILABLE");
      const body: unknown = await response.json().catch(() => undefined);
      return isAddressSearchPage(body)
        ? { ok: true as const, ...body }
        : failure("UNAVAILABLE");
    } catch {
      return failure("NETWORK");
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  return (
    message: unknown,
    sender: { id?: string; url?: string },
  ): Promise<AddressSearchResult> | undefined => {
    if (
      typeof message !== "object" ||
      message === null ||
      !("type" in message) ||
      message.type !== ADDRESS_SEARCH_MESSAGE
    )
      return undefined;
    const { query, page } = message as { query?: unknown; page?: unknown };
    const trimmed = typeof query === "string" ? query.trim() : "";
    if (
      sender.id !== extensionId ||
      !sender.url?.startsWith(pageOrigin) ||
      trimmed.length < 1 ||
      trimmed.length > MAX_QUERY_LENGTH ||
      typeof page !== "number" ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > MAX_PAGE
    )
      return Promise.resolve(failure("INVALID_INPUT"));
    return run(trimmed, page);
  };
}
