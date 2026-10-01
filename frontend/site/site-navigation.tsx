import { createContext, useContext, type ComponentProps } from "react";

export const SiteUrlContext = createContext<(path: string) => string>(
  (path) => path,
);
export const useSiteUrl = () => useContext(SiteUrlContext);

export function SiteLink({ href, ...props }: ComponentProps<"a">) {
  const siteUrl = useSiteUrl();
  return <a {...props} href={href ? siteUrl(href) : href} />;
}
