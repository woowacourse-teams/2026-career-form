import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { createEmptyProfile } from "../model";
import { QuickStartOverview } from "./QuickStartOverview";
it("lets people add missing basics and resume only nonempty saved entries", () => {
  const profile = createEmptyProfile();
  profile.contact.email = "demo@example.test";
  profile.education = [
    {
      id: "school",
      sectionId: "university",
      values: { schoolName: "합성대학교" },
    },
    { id: "empty", sectionId: "highSchool", values: { schoolName: " " } },
  ];
  profile.careers = [
    { id: "career", sectionId: "career", values: { companyName: "합성회사" } },
  ];
  profile.projects = [
    {
      id: "project",
      sectionId: "project",
      values: { projectName: "합성프로젝트" },
    },
  ];
  profile.personal.birthDate = "1990-01-01";
  let action = "";
  render(
    <QuickStartOverview
      profile={profile}
      onEditBasic={(step) => {
        action = step;
      }}
      onSelectEntry={(chapter, entry) => {
        action = `${chapter}:${entry.id}`;
      }}
    />,
  );
  expect(screen.getByText("demo@example.test")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이름 수정" }));
  expect(action).toBe("name");
  fireEvent.click(screen.getByRole("button", { name: "전화번호 수정" }));
  expect(action).toBe("phone");
  fireEvent.click(
    screen.getByRole("button", { name: "합성대학교 이어서 채우기" }),
  );
  expect(action).toBe("education:school");
  fireEvent.click(
    screen.getByRole("button", { name: "합성회사 이어서 채우기" }),
  );
  expect(action).toBe("careers:career");
  fireEvent.click(
    screen.getByRole("button", { name: "합성프로젝트 이어서 채우기" }),
  );
  expect(action).toBe("projects:project");
  expect(screen.queryByText("이름 없는 항목")).not.toBeInTheDocument();
  expect(screen.queryByText("1990-01-01")).not.toBeInTheDocument();
});
