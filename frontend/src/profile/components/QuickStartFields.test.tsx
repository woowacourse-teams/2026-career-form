import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createEmptyProfile, type ProfileEntry } from "../model";
import { QuickStartFields, Summary, entrySummary } from "./QuickStartFields";
import { QuickStartPicker } from "./QuickStartSections";
const school: ProfileEntry = {
  id: "school",
  sectionId: "university",
  values: {
    schoolName: "합성대학교",
    degreeLevel: "학사",
    completionStatus: "재학중",
    endDate: "2026-02-20",
  },
};
function fields(
  step: Parameters<typeof QuickStartFields>[0]["step"],
  entry = school,
) {
  return render(
    <QuickStartFields
      step={step}
      profile={createEmptyProfile()}
      entry={entry}
      chapter="education"
      updateSingle={() => {}}
      updateEntry={() => {}}
    />,
  );
}
describe("progressive profile fields", () => {
  it("offers summary edits without hiding unrelated saved fields", () => {
    let destination = "";
    render(
      <Summary
        values={entrySummary({
          ...school,
          values: { ...school.values, customField: "기존 값" },
        })}
        onEdit={(step) => {
          destination = step;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "학교명 수정" }));
    expect(destination).toBe("school");
    fireEvent.click(screen.getByRole("button", { name: "학위구분 수정" }));
    expect(destination).toBe("educationDetails");
    expect(screen.getByText("기존 값")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "customField 수정" }),
    ).not.toBeInTheDocument();
  });
  it("shows the attendance label while preserving its saved code", () => {
    const entry = { ...school, values: { attendanceType: "attendance:day" } };
    render(<Summary values={entrySummary(entry)} />);
    expect(screen.getByText("주간")).toBeInTheDocument();
    expect(entry.values.attendanceType).toBe("attendance:day");
  });
  it.each(["재학중", "휴학"])(
    "does not ask for graduation date for %s",
    (completionStatus) => {
      fields("educationDates", {
        ...school,
        values: { ...school.values, completionStatus },
      });
      expect(screen.getByLabelText("입학일")).toBeInTheDocument();
      expect(screen.queryByLabelText("졸업일")).not.toBeInTheDocument();
    },
  );
  it.each([
    ["졸업예정", "졸업 예정일"],
    ["중퇴", "학업 종료일"],
  ])("labels the end date for %s", (completionStatus, label) => {
    fields("educationDates", {
      ...school,
      values: { ...school.values, completionStatus },
    });
    expect(screen.getByLabelText(label)).toHaveValue("2026-02-20");
  });
  it("offers university supplemental choices", () => {
    fields("educationDetails");
    expect(
      screen.getByRole("group", { name: "학교 유형" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "학사" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("group", { name: "주·야간" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "주간" })).toBeInTheDocument();
  });
  it("places saved entries first and omits empty legacy entries", () => {
    const profile = createEmptyProfile();
    profile.education = [
      school,
      { id: "empty", sectionId: "university", values: { schoolName: "  " } },
    ];
    render(
      <QuickStartPicker education profile={profile} selectEntry={() => {}} />,
    );
    expect(screen.getAllByRole("button")[0]).toHaveTextContent(
      "기존 항목 수정: 합성대학교",
    );
    expect(screen.queryByText(/이름 없는 항목/)).not.toBeInTheDocument();
  });
});
