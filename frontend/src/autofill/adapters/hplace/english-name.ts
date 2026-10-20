import { debugCollectionSkip } from "../../debug/structural-diagnostics";
/** Company guidance owned by the applicant subject establishes name order.
 * Without any guide the user-chosen default is family-first ("HONG GILDONG",
 * 2026-10-20); a present but unreadable or duplicated guide stays unfilled. */
export function englishNameOrder(
  input: HTMLInputElement,
): "givenFirst" | "familyFirst" | undefined {
  const subject = input.closest(".subject");
  if (!subject) return;
  const guides = Array.from(
    subject.querySelectorAll("div.wrapGuide > div.guide.englishName"),
  ).filter((e) => e.closest(".subject") === subject);
  if (!guides.length) {
    // A guide elsewhere on the page may still be meant for this field.
    if (input.ownerDocument.querySelector("div.guide.englishName")) {
      debugCollectionSkip(
        "hplace.detail.englishName",
        "guide-ambiguous",
        "foreign-guide",
      );
      return;
    }
    return "familyFirst";
  }
  if (guides.length !== 1) {
    debugCollectionSkip(
      "hplace.detail.englishName",
      "guide-ambiguous",
      "owned-guide-count",
    );
    return;
  }
  const text = guides[0].textContent?.replace(/\s+/g, " ").trim() ?? "";
  const matches = [
    ...text.matchAll(
      /이름\s*\+\s*성|성\s*\+\s*이름|First\s+Last|Given\s+Family/gi,
    ),
  ];
  // No order phrase: follow the order of the platform's standard sample name
  // (홍길동) when exactly one sample order appears (KDI "Hong, Gildong",
  // 2026-10-20 user decision). Any other or mixed sample stays ambiguous.
  if (!matches.length) {
    const familyFirst = [...text.matchAll(/\bhong\s*,?\s+gil-?dong\b/gi)];
    const givenFirst = [...text.matchAll(/\bgil-?dong\s*,?\s+hong\b/gi)];
    if (familyFirst.length + givenFirst.length === 1)
      return familyFirst.length ? "familyFirst" : "givenFirst";
    debugCollectionSkip(
      "hplace.detail.englishName",
      "guide-ambiguous",
      "sample-order",
    );
    return;
  }
  if (
    matches.length !== 1 ||
    !/^\s*-?\s*$/.test(text.slice(0, matches[0].index))
  ) {
    debugCollectionSkip(
      "hplace.detail.englishName",
      "guide-ambiguous",
      "order-pattern",
    );
    return;
  }
  const suffix = text.slice(matches[0].index! + matches[0][0].length);
  if (suffix && !/^\s*\/\s*ex\)?[.:]?\s+[^/]+$/i.test(suffix)) {
    debugCollectionSkip(
      "hplace.detail.englishName",
      "guide-ambiguous",
      "order-suffix",
    );
    return;
  }
  return /^성/.test(matches[0][0]) ? "familyFirst" : "givenFirst";
}
export function englishNameDomName(input: HTMLInputElement): string {
  const order = englishNameOrder(input);
  return `hplace.detail.englishName${order ? `.${order}` : ""}`;
}
