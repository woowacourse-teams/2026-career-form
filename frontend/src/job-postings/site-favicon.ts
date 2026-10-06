import { browser } from "wxt/browser";
import { isHttpUrl } from "./model";
const prefix = "careerForm.siteIcon.";
export function iconCandidates(html: string, pageUrl: string): string[] {
  const page = new URL(pageUrl);
  const document = new DOMParser().parseFromString(html, "text/html");
  const candidates = [
    ...document.querySelectorAll<HTMLLinkElement>("link[rel][href]"),
  ]
    .filter((link) =>
      /^(icon|shortcut icon|apple-touch-icon)$/i.test(link.rel.trim()),
    )
    .map((link) => {
      try {
        return new URL(link.getAttribute("href")!, page).href;
      } catch {
        return "";
      }
    })
    .filter((url) => isHttpUrl(url) && new URL(url).origin === page.origin);
  return [...new Set([...candidates, new URL("/favicon.ico", page).href])];
}
export async function cachedSiteIcon(url: string): Promise<string | undefined> {
  try {
    const value = (await browser.storage.local.get(prefix + url))[prefix + url];
    return typeof value === "string" && value.startsWith("data:image/")
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
// Only use access already granted; favicon retrieval must never prompt.
export async function captureSiteIcon(
  url: string,
  _requestPermission = false,
): Promise<void> {
  if (!isHttpUrl(url)) return;
  try {
    const origin = new URL(url).origin;
    const permissions = { origins: [origin + "/*"] };
    const allowed = await browser.permissions.contains(permissions);
    if (!allowed) return;
    const signal = AbortSignal.timeout(4000);
    const options: RequestInit = {
      credentials: "omit",
      redirect: "follow",
      signal,
    };
    let html = "";
    let pageUrl = url;
    try {
      const page = await fetch(url, options);
      if (page.ok) {
        if (page.url && isHttpUrl(page.url)) pageUrl = page.url;
        const body = await page.text();
        if (body.length <= 2_000_000) html = body;
      }
    } catch {
      /* Root favicon remains a useful fallback. */
    }
    for (const candidate of iconCandidates(html, pageUrl)) {
      try {
        const response = await fetch(candidate, options);
        if (!response.ok) continue;
        const blob = await response.blob();
        if (
          !blob.type.startsWith("image/") ||
          blob.size > 256_000 ||
          !blob.size
        )
          continue;
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        await browser.storage.local.set({ [prefix + url]: data });
        return;
      } catch {
        if (signal.aborted) return;
      }
    }
  } catch {
    /* Icon retrieval must never prevent saving a posting. */
  }
}
