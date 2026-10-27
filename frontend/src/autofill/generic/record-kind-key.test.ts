import { describe, expect, it } from "vitest";
import { careerKeyForProjectRole } from "./record-kind-key";

const career = (field: string) => `careers.career.${field}`;

describe("careerKeyForProjectRole", () => {
  it("reads a project role between career fields as the career position", () => {
    expect(
      careerKeyForProjectRole("projects.project.role", [
        career("companyName"),
        career("employmentType"),
      ]),
    ).toBe("careers.career.position");
  });

  it.each([
    ["a project neighbor", [career("endDate"), "projects.project.startDate"]],
    ["one missing neighbor", [career("companyName"), undefined]],
    [
      "neighbors of another kind",
      ["languages.languageTest.grade", "languages.languageTest.testName"],
    ],
  ] as const)("keeps the role with %s", (_name, neighbors) => {
    expect(
      careerKeyForProjectRole("projects.project.role", [...neighbors]),
    ).toBe("projects.project.role");
  });

  it("keeps other keys", () => {
    expect(
      careerKeyForProjectRole("projects.project.projectName", [
        career("companyName"),
        career("employmentType"),
      ]),
    ).toBe("projects.project.projectName");
  });
});
