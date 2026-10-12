import { cachedSiteIcon, captureSiteIcon } from "./site-favicon";
import { useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { isDefaultFavicon } from "./favicon";
import { isHttpUrl } from "./model";
import styles from "./JobPostings.module.css";
function faviconUrl(pageUrl: string): string | undefined {
  if (!isHttpUrl(pageUrl)) return;
  try {
    if (!browser.runtime.id) return;
    const url = new URL(`chrome-extension://${browser.runtime.id}/_favicon/`);
    url.searchParams.set("pageUrl", pageUrl);
    url.searchParams.set("size", "64");
    return url.href;
  } catch {
    return;
  }
}
export function PostingIcon({
  company,
  url,
}: {
  company: string;
  url: string;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );
  const [useRootIcon, setUseRootIcon] = useState(false);
  const [stored, setStored] = useState<string>();
  const currentIcon = useRef<string | undefined>(undefined);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const icon = await cachedSiteIcon(url);
      if (active && icon && icon !== currentIcon.current) {
        currentIcon.current = icon;
        setStored(icon);
        setState("loading");
      }
      return icon;
    };
    void refresh().then(async (icon) => {
      if (!icon && active) {
        await captureSiteIcon(url, false);
        if (active) await refresh();
      }
    });
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === "local" && "careerForm.siteIcon." + url in changes)
        void refresh();
    };
    let unsubscribe = () => {};
    try {
      browser.storage?.onChanged?.addListener(changed);
      unsubscribe = () => browser.storage?.onChanged?.removeListener(changed);
    } catch {
      /* Static previews have no extension storage. */
    }
    return () => {
      active = false;
      unsubscribe();
    };
  }, [url]);
  const src =
    stored ??
    (useRootIcon && isHttpUrl(url)
      ? new URL("/favicon.ico", url).href
      : faviconUrl(url));
  const tryFallback = () => {
    if (stored) {
      setStored(undefined);
      setState("loading");
    } else if (!useRootIcon) {
      setUseRootIcon(true);
      setState("loading");
    } else setState("failed");
  };
  return (
    <span
      className={styles.companyMark}
      data-has-icon={state === "loaded" && Boolean(src)}
      aria-hidden="true"
    >
      {(state !== "loaded" || !src) && company.slice(0, 1)}
      {src && state !== "failed" && (
        <img
          className={styles.favicon}
          src={src}
          alt=""
          width={36}
          height={36}
          style={{ visibility: state === "loaded" ? "visible" : "hidden" }}
          onLoad={() => {
            if (stored || useRootIcon) {
              setState("loaded");
              return;
            }
            void isDefaultFavicon(src).then((isDefault) =>
              isDefault ? tryFallback() : setState("loaded"),
            );
          }}
          onError={tryFallback}
          referrerPolicy="no-referrer"
        />
      )}
    </span>
  );
}
