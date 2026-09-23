export const SCHOOL_REGION_SELECTION_EVENT =
  "career-form:school-region-selection";

const SCHOOL_PLACE_CALLBACK =
  /^javascript:setSchoolPlaceData\(\s*(['"])([^'"]+)\1\s*\)\s*;?$/i;

export function schoolPlaceCallbackValue(href: string): string | undefined {
  const match = href.trim().match(SCHOOL_PLACE_CALLBACK);
  if (!match?.[2]) return undefined;
  const [code, label, country, ...rest] = match[2].split("||");
  if (
    rest.length ||
    !code ||
    !/^[A-Z0-9_-]{1,20}$/i.test(code) ||
    !label?.trim() ||
    label.length > 40 ||
    country !== "KOR"
  )
    return undefined;
  return `${code}||${label}||${country}`;
}

/** Legacy entry point is deliberately inert; generic execution never invokes page callbacks. */
export function installSchoolRegionMainBridge(_document: Document): () => void {
  return () => {};
}
