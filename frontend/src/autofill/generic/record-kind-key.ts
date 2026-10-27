const CAREER_KIND = "careers.";

/**
 * A project role key between two career fields of one row asks for the career
 * position: the row runs a career record, and its role field is the position.
 */
export function careerKeyForProjectRole(
  key: string,
  neighbors: readonly (string | undefined)[],
): string {
  return key === "projects.project.role" &&
    neighbors.length === 2 &&
    neighbors.every((neighbor) => neighbor?.startsWith(CAREER_KIND))
    ? "careers.career.position"
    : key;
}
