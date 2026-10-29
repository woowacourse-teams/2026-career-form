import { describe, expect, it } from "vitest";
import { careerKeyForProjectRole } from "./record-kind-key";

const career = (field: string) => `careers.career.${field}`;
const between = [career("companyName"), career("employmentType")];

describe("careerKeyForProjectRole", () => {
  it.each(["부서명/직책", "직위", "직급", "Position", "Job title"])(
    "reads a project role labelled %s between career fields as the position",
    (label) => {
      expect(
        careerKeyForProjectRole("projects.project.role", between, [label], []),
      ).toBe("careers.career.position");
    },
  );

  it.each(["담당업무", "담당 역할", "직무", "역할", "직책 및 담당업무"])(
    "keeps a role labelled %s",
    (label) => {
      expect(
        careerKeyForProjectRole("projects.project.role", between, [label], []),
      ).toBe("projects.project.role");
    },
  );

  it("keeps the role when the row already maps the position", () => {
    expect(
      careerKeyForProjectRole(
        "projects.project.role",
        between,
        ["직책"],
        [career("position")],
      ),
    ).toBe("projects.project.role");
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
      careerKeyForProjectRole(
        "projects.project.role",
        [...neighbors],
        ["직책"],
        [],
      ),
    ).toBe("projects.project.role");
  });

  it("keeps other keys", () => {
    expect(
      careerKeyForProjectRole(
        "projects.project.projectName",
        between,
        ["직책"],
        [],
      ),
    ).toBe("projects.project.projectName");
  });
});
