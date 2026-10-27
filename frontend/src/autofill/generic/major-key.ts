const MAJOR_WORD = /전공|major/i;
const FIELD_WORD = /계열|분야|field|category/i;

/**
 * The profile keeps a major's field as a fixed-option select and its name as
 * text. A plain "전공" text input mapped to the field key asks for the name.
 */
export function majorNameKeyForText(
  key: string,
  control: string,
  labels: readonly (string | undefined)[],
): string {
  const match = /^(education\.[A-Za-z]+\.)(major|minor)Field$/.exec(key);
  if (!match || control !== "text") return key;
  const texts = labels.filter((text): text is string => Boolean(text?.trim()));
  if (
    !texts.some((text) => MAJOR_WORD.test(text)) ||
    texts.some((text) => FIELD_WORD.test(text))
  )
    return key;
  return `${match[1]}${match[2]}Name`;
}
