const HEADING = "h1, h2, h3, h4, h5, h6, [role='heading']";
const CONTROL = "input:not([type='hidden']), select, textarea";
/** "공고 제목 | 회사": a separator needs a space on both sides. */
const LEADING_SEPARATOR = /^ [|\-–—:·] /;
const TRAILING_SEPARATOR = / [|\-–—:·] $/;
// Node.DOCUMENT_POSITION_FOLLOWING without depending on this realm's Node.
const DOCUMENT_POSITION_FOLLOWING = 4;

function normalized(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

/**
 * The document's first heading, when another heading still separates it from
 * the first control. A heading directly above the first control names that
 * group of controls, so it is never the page's own name.
 */
function topHeadingText(document: Document): string | undefined {
  const control = document.querySelector(CONTROL);
  if (!control) return undefined;
  const [first, second] = Array.from(document.querySelectorAll(HEADING)).filter(
    (heading) =>
      normalized(heading.textContent) && !heading.querySelector(CONTROL),
  );
  return first &&
    second &&
    second.compareDocumentPosition(control) & DOCUMENT_POSITION_FOLLOWING
    ? normalized(first.textContent)
    : undefined;
}

/**
 * Matches text that names the whole page (a job posting title, the site
 * name), not a group of fields: it equals the document title or the top
 * heading, or the part of either before or after a separator. The page is
 * read once, when the matcher is made.
 */
export function pageTitleMatcher(
  document: Document,
): (value: string | null | undefined) => boolean {
  const names = [normalized(document.title), topHeadingText(document)].filter(
    (name): name is string => Boolean(name),
  );
  return (value) => {
    const text = normalized(value);
    if (!text) return false;
    return names.some(
      (name) =>
        name === text ||
        (name.startsWith(text) &&
          LEADING_SEPARATOR.test(name.slice(text.length))) ||
        (name.endsWith(text) &&
          TRAILING_SEPARATOR.test(name.slice(0, name.length - text.length))),
    );
  };
}
