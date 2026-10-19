import { debugCollectionSkip } from "../../debug/structural-diagnostics";
/** Only company guidance owned by the applicant subject establishes name order. */
export function englishNameOrder(
  input: HTMLInputElement,
): "givenFirst" | "familyFirst" | undefined {
  const subject = input.closest(".subject");
  if (!subject) return;
  const guides = Array.from(
    subject.querySelectorAll("div.wrapGuide > div.guide.englishName"),
  ).filter((e) => e.closest(".subject") === subject);
  if (guides.length !== 1) {
    debugCollectionSkip(
      "hplace.detail.englishName",
      guides.length ? "guide-ambiguous" : "guide-missing",
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
