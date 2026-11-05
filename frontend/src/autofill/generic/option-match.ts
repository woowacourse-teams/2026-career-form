/**
 * Generic option matching: which page option a stored value names. Pure and
 * deterministic; no site tables and no fuzzy distance scoring.
 *
 * Tiers, strongest first. The first tier that matches anything decides:
 * exactly one option -> its index, several -> null (ambiguity never picks).
 *   1. normalized exact
 *   2. token-set equality
 *   3. one side's token sequence fully contained in the other's
 *
 * Grading uses only tiers 1-2 (matchOptionIndex*): a containment-only match
 * must never auto-fill. Tier 3 is exposed through suggestOptionIndex for
 * review-time hints only.
 */

const BRACKETED = /\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g;
const TOKEN = /[\p{L}\p{N}]+/gu;

/** Trim, collapse whitespace, lowercase, full-width to half-width. */
export function normalizeOptionText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Word tokens of normalized text. Bracketed content and punctuation are
 * dropped only while a token still remains.
 */
function tokensOf(normalized: string): string[] {
  const stripped = normalized.replace(BRACKETED, " ").match(TOKEN) ?? [];
  return stripped.length > 0 ? stripped : (normalized.match(TOKEN) ?? []);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((t) => right.has(t));
}

function containsSequence(
  haystack: readonly string[],
  needle: readonly string[],
): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((token, i) => haystack[start + i] === token)) return true;
  }
  return false;
}

type Tier = (value: string, option: string) => boolean;

const STRICT_TIERS: readonly Tier[] = [
  (value, option) => value !== "" && value === option,
  (value, option) => {
    const a = tokensOf(value);
    return a.length > 0 && sameSet(a, tokensOf(option));
  },
];

const SUGGEST_TIERS: readonly Tier[] = [
  ...STRICT_TIERS,
  (value, option) => {
    const a = tokensOf(value);
    const b = tokensOf(option);
    return containsSequence(a, b) || containsSequence(b, a);
  },
];

function pickIndex(
  tiers: readonly Tier[],
  values: readonly string[],
  optionTexts: readonly string[],
): number | null {
  const wanted = values.map(normalizeOptionText).filter((v) => v !== "");
  if (wanted.length === 0) return null;
  const options = optionTexts.map(normalizeOptionText);
  for (const tier of tiers) {
    const hits = options.flatMap((option, index) =>
      wanted.some((value) => tier(value, option)) ? [index] : [],
    );
    if (hits.length > 0) return hits.length === 1 ? hits[0]! : null;
  }
  return null;
}

/**
 * Index of the single option any of `values` names by normalized exact or
 * token-set equality, or null when none does or the deciding tier matches
 * more than one option. Safe for grading.
 */
export function matchOptionIndexAny(
  values: readonly string[],
  optionTexts: readonly string[],
): number | null {
  return pickIndex(STRICT_TIERS, values, optionTexts);
}

export function matchOptionIndex(
  value: string,
  optionTexts: readonly string[],
): number | null {
  return matchOptionIndexAny([value], optionTexts);
}

/**
 * Like matchOptionIndex but also accepts a unique containment match. For
 * review hints only; it must not feed grading or a write plan.
 */
export function suggestOptionIndex(
  value: string,
  optionTexts: readonly string[],
): number | null {
  return pickIndex(SUGGEST_TIERS, [value], optionTexts);
}
