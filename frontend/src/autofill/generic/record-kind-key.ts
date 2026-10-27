const CAREER_KIND = "careers.";
const POSITION_TEXT = /직책|직위|직급|position|title/i;
const DUTY_TEXT = /담당|업무|역할|직무|duty|duties|responsibilit|role/i;

/**
 * A project role key between two career fields of one row, on a field named
 * as a position (직책, 직위) and not as duties, asks for the career position.
 * A row that already maps the position keeps the role key as it is.
 */
export function careerKeyForProjectRole(
  key: string,
  neighbors: readonly (string | undefined)[],
  labels: readonly (string | undefined)[],
  rowKeys: readonly string[],
): string {
  const texts = labels.filter((text): text is string => Boolean(text?.trim()));
  return key === "projects.project.role" &&
    neighbors.length === 2 &&
    neighbors.every((neighbor) => neighbor?.startsWith(CAREER_KIND)) &&
    !rowKeys.includes("careers.career.position") &&
    texts.some((text) => POSITION_TEXT.test(text)) &&
    !texts.some((text) => DUTY_TEXT.test(text))
    ? "careers.career.position"
    : key;
}
