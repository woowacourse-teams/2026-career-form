import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildResultDiagnostics,
  emitResultDiagnostics,
} from "../generic/result-diagnostics";
import type { ReviewPlanItem } from "../review/review-plan";
import { WorkflowResults } from "./WorkflowResults";
import { buildResultModel, profileGroups } from "./result-model";

afterEach(cleanup);

const blocked = (
  id: string,
  fieldLabel: string,
  extra: Partial<ReviewPlanItem> = {},
): ReviewPlanItem => ({
  candidateId: id,
  fieldLabel,
  currentValue: "",
  previewValue: "",
  status: "unavailable",
  selected: false,
  disabled: true,
  revealed: true,
  reason: "",
  genericGrade: "BLOCKED",
  ...extra,
});
const reviewItems = [
  blocked("a", "메모"),
  blocked("b", "비고"),
  blocked("c", "휴대폰", { profileFieldKey: "contact.contact.phoneNumber" }),
  blocked("p", "이름", {
    profileFieldKey: "personal.personal.koreanGivenName",
    profileValue: "값",
  }),
];

describe("profile groups in the pending panel", () => {
  it("lists them collapsed with counts and no failure tag or copy button", () => {
    const onOpenProfile = vi.fn();
    render(
      <WorkflowResults
        reviewItems={reviewItems}
        results={[]}
        profileGroupsVisible
        onOpenProfile={onOpenProfile}
      />,
    );
    expect(screen.getByLabelText("확인 필요 1개")).toBeVisible();
    const groups = [...document.querySelectorAll("details")];
    expect(groups).toHaveLength(2);
    expect(groups.every((group) => !group.open)).toBe(true);
    const [notInProfile, profileUnset] = groups;
    expect(notInProfile.querySelector("summary")).toHaveTextContent(
      "프로필에 없는 항목 2",
    );
    expect(notInProfile.querySelector("summary strong")).toHaveTextContent("2");
    expect(profileUnset.querySelector("summary")).toHaveTextContent(
      "프로필 미입력 1",
    );
    expect(
      [...notInProfile.querySelectorAll("li")].map((li) => li.textContent),
    ).toEqual(["메모", "비고"]);
    expect(notInProfile.querySelector("button")).toBeNull();
    expect(profileUnset).not.toHaveTextContent("입력 못함");
    fireEvent.click(profileUnset.querySelector("button")!);
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
    expect(profileUnset.querySelector("button")).toHaveTextContent(
      "프로필 채우기",
    );
  });

  it("omits the profile link when no handler is given", () => {
    render(
      <WorkflowResults
        reviewItems={reviewItems}
        results={[]}
        profileGroupsVisible
      />,
    );
    expect(document.querySelectorAll("details button")).toHaveLength(0);
  });

  it("shows the groups below the empty message when nothing is pending", () => {
    render(
      <WorkflowResults
        reviewItems={reviewItems.slice(0, 2)}
        results={[]}
        profileGroupsVisible
      />,
    );
    expect(screen.getByText("확인할 항목이 없어요.")).toBeInTheDocument();
    expect(screen.getByLabelText("확인 필요 0개")).toBeVisible();
    expect(document.querySelectorAll("details")).toHaveLength(1);
  });

  it("renders no groups by default", () => {
    render(<WorkflowResults reviewItems={reviewItems} results={[]} />);
    expect(document.querySelector("details")).toBeNull();
    expect(screen.getByLabelText("확인 필요 1개")).toBeVisible();
  });
});

describe("result diagnostics", () => {
  it("counts the same numbers the results panel renders", () => {
    render(
      <WorkflowResults
        reviewItems={reviewItems}
        results={[]}
        profileGroupsVisible
      />,
    );
    const model = buildResultModel({ reviewItems, results: [] });
    const counts = buildResultDiagnostics(model, profileGroups(model));
    expect(counts).toEqual({
      completed: 0,
      pending: 1,
      notInProfile: 2,
      profileUnset: 1,
    });
    const tab = (state: string) =>
      document.querySelector(`[data-state=${state}]`)!.getAttribute("data-count");
    expect(tab("pending")).toBe(String(counts.pending));
    expect(tab("completed")).toBe(String(counts.completed));
    expect(
      [...document.querySelectorAll("details summary strong")].map(
        (node) => node.textContent,
      ),
    ).toEqual([String(counts.notInProfile), String(counts.profileUnset)]);
  });

  it("logs nothing unless the local diagnostics gate is on", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const model = buildResultModel({ reviewItems, results: [] });
    emitResultDiagnostics(model, profileGroups(model));
    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });
});
