const SCALE_TEXT = /총점|만점|기준\s*점수|\bscale\b|out\s+of|\bmax(?:imum)?\b/i;
const CREDIT_TEXT = /학점|이수|credit/i;

/**
 * A score-scale field ("총점", "만점") beside the same record's GPA score
 * asks for that GPA's scale, not a credit count.
 */
export function gpaScaleKeyForCredits(
  key: string,
  labels: readonly (string | undefined)[],
  sectionKeys: readonly string[],
): string {
  const match = /^(education\.[A-Za-z]+\.)totalCredits$/.exec(key);
  if (!match || !sectionKeys.includes(`${match[1]}gpaScore`)) return key;
  const texts = labels.filter((text): text is string => Boolean(text?.trim()));
  return texts.some((text) => SCALE_TEXT.test(text)) &&
    !texts.some((text) => CREDIT_TEXT.test(text))
    ? `${match[1]}gpaScale`
    : key;
}
