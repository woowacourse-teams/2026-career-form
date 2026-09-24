import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { ReviewPlanItem } from "../review/review-plan";
import { WorkflowResults } from "./WorkflowResults";

const item: ReviewPlanItem = {
  candidateId: "major",
  fieldLabel: "전공",
  currentValue: "",
  previewValue: "컴퓨터공학",
  profileValue: "컴퓨터공학",
  status: "unavailable",
  selected: false,
  disabled: true,
  revealed: true,
  reason: "후보 여러 개",
};

it("keeps the compact locate action identifiable and moves to its application field", () => {
  const applicationField = document.createElement("input");
  document.body.append(applicationField);
  try {
    render(
      <WorkflowResults
        reviewItems={[{ ...item, fieldLabel: "대학교 / 주전공명 (1)" }]}
        results={[]}
        optionsFor={() => ["컴퓨터공학부", "컴퓨터공학과"]}
        onLocate={(id) => {
          if (id !== "major") return false;
          applicationField.focus();
          return true;
        }}
      />,
    );
    const locate = screen.getByRole("button", {
      name: "대학교 / 주전공명 (1) 필드로 이동",
    });
    expect(locate).toHaveTextContent("↗");
    expect(locate).toHaveAttribute("title", "필드로 이동");
    expect(
      screen.getByText("지원서 선택지").closest("details"),
    ).not.toHaveAttribute("open");
    fireEvent.click(locate);
    expect(applicationField).toHaveFocus();
  } finally {
    applicationField.remove();
  }
});

it("shows a concise bound field name instead of required markers and all select options", () => {
  render(
    <WorkflowResults
      reviewItems={[
        {
          ...item,
          fieldLabel: "국적 *필수항목 대한민국 가나 가봉 가이아나 감비아",
          profileFieldKey: "personal.personal.nationality",
          profileValue: "대한민국",
        },
      ]}
      results={[]}
    />,
  );
  expect(
    screen.getByRole("button", { name: "국적 필드로 이동" }),
  ).toBeDisabled();
  expect(screen.queryByText(/가이아나/)).not.toBeInTheDocument();
  expect(screen.queryByText(/필수항목/)).not.toBeInTheDocument();
});

it("keeps repeat rows and school levels identifiable in concise completed labels", () => {
  const fields = [
    {
      ...item,
      candidateId: "high",
      profileFieldKey: "education.highSchool.schoolName",
      itemIndex: 0,
      fieldLabel: "학교명 1 *필수항목",
    },
    {
      ...item,
      candidateId: "uni",
      profileFieldKey: "education.university.schoolName",
      itemIndex: 1,
      fieldLabel: "학교명 2 *필수항목",
    },
  ];
  render(
    <WorkflowResults
      reviewItems={fields}
      results={fields.map((field) => ({
        candidateId: field.candidateId,
        status: "written",
      }))}
    />,
  );
  const completed = screen.getByRole("region", { name: "입력 완료 내역" });
  expect(within(completed).queryByText("고등학교 1")).toBeNull();
  expect(within(completed).queryByText("대학교 2")).toBeNull();
  expect(within(completed).queryByText(/필수항목/)).not.toBeInTheDocument();
});

it("omits skipped inventory without turning excluded controls into required review", () => {
  render(
    <WorkflowResults
      reviewItems={Array.from({ length: 108 }, (_, index) => ({
        ...item,
        candidateId: `unmapped-${index}`,
        fieldLabel: `지원하지 않는 입력 ${index}`,
        profileValue: undefined,
        previewValue: "",
      }))}
      results={[]}
    />,
  );
  expect(
    screen.queryAllByText(
      /건너뛴 항목 보기|자동 입력 미지원|지원하지 않는 입력/,
    ),
  ).toHaveLength(0);
  expect(
    screen.queryByRole("region", { name: "확인 필요한 항목" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("입력 완료 0개")).toBeInTheDocument();
});

it("does not present a top-level education choice as belonging to one repeated school", () => {
  render(
    <WorkflowResults
      reviewItems={[
        {
          ...item,
          fieldLabel:
            "최종 학력 *필수항목 고등학교 전문대학(전문학사) 대학(학사)",
          profileFieldKey: "education.university.latestEducationType",
          itemIndex: 0,
          profileValue: "대학(학사)",
        },
      ]}
      results={[]}
    />,
  );
  expect(
    screen.getByRole("button", { name: "최종학력 필드로 이동" }),
  ).toBeDisabled();
  expect(screen.queryByText(/대학교 \/ 최종학력/)).not.toBeInTheDocument();
});

it("announces the completed summary without moving focus or including interactive details", () => {
  const { rerender } = render(
    <div>
      <input aria-label="사용자가 입력 중인 필드" />
    </div>,
  );
  const input = screen.getByRole("textbox", {
    name: "사용자가 입력 중인 필드",
  });
  input.focus();
  rerender(
    <div>
      <input aria-label="사용자가 입력 중인 필드" />
      <WorkflowResults
        reviewItems={[item]}
        results={[{ candidateId: "name", status: "written" }]}
      />
    </div>,
  );
  const status = screen.getByRole("status");
  expect(status).toHaveAttribute("aria-atomic", "true");
  expect(
    within(status).getByRole("heading", { name: "자동 기입을 마쳤어요" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("tab", { name: "입력 완료 1개" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "확인 필요 1개" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(within(status).queryByRole("button")).not.toBeInTheDocument();
  expect(within(status).queryByText("컴퓨터공학")).not.toBeInTheDocument();
  expect(input).toHaveFocus();
});

it("presents unsuccessful writes as an actionable review item instead of a separate failure group", () => {
  render(
    <WorkflowResults
      reviewItems={[{ ...item, status: "available" }]}
      results={[
        {
          candidateId: "major",
          status: "skipped",
          reason: "네이티브 컨트롤에 안전하게 입력할 수 없습니다.",
        },
      ]}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "자동 기입을 마쳤어요" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("입력 완료 0개")).toBeInTheDocument();
  expect(screen.getByLabelText("확인 필요 1개")).toBeInTheDocument();
  expect(
    screen.getByText(
      "자동으로 입력하지 못했어요. 지원서에서 이 값을 직접 입력해 주세요.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "입력 실패" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "확인 필요한 항목" }),
  ).toBeVisible();
});

it("marks an uncertain written value as entered without counting it again as completed", () => {
  render(
    <WorkflowResults
      reviewItems={[{ ...item, status: "needs-review" }]}
      results={[{ candidateId: "major", status: "written" }]}
      progress={[
        { id: "dom-major", label: "전공", category: "학력", status: "written" },
      ]}
      wasWritten={() => true}
      progressIdFor={() => "dom-major"}
      fieldStateFor={() => ({ visible: true, value: "다른 전공" })}
    />,
  );
  expect(screen.getByLabelText("입력 완료 0개")).toBeInTheDocument();
  expect(screen.getByLabelText("확인 필요 1개")).toBeInTheDocument();
  const review = screen.getByRole("region", { name: "확인 필요한 항목" });
  expect(within(review).getByText("입력됨")).toBeInTheDocument();
  expect(
    within(review).getByText(
      "입력 결과를 확인하지 못했어요. 지원서에 값이 들어갔는지 확인해 주세요.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "입력 완료 내역" }),
  ).not.toBeInTheDocument();
});

it("keeps already matching values out of both required review and skipped UI", () => {
  render(
    <WorkflowResults
      reviewItems={[item]}
      results={[]}
      fieldStateFor={() => ({ visible: true, value: "컴퓨터공학" })}
    />,
  );
  expect(
    screen.queryAllByText(/건너뛴 항목 보기|기존 값 유지|후보 여러 개/),
  ).toHaveLength(0);
  expect(
    screen.queryByRole("button", { name: "확인할 항목 보기" }),
  ).not.toBeInTheDocument();
});

it("opens completed categories by default when no review is needed without losing earlier writes", () => {
  render(
    <WorkflowResults
      reviewItems={[]}
      results={[{ candidateId: "latest-name", status: "written" }]}
      progress={[
        { id: "name", label: "이름", category: "기본 정보", status: "written" },
        {
          id: "email",
          label: "이메일",
          category: "기본 정보",
          status: "written",
        },
        { id: "school", label: "학교명", category: "학력", status: "written" },
      ]}
    />,
  );
  expect(screen.getByLabelText("입력 완료 3개")).toBeInTheDocument();
  const categories = screen.getByRole("list", {
    name: "범주별 입력 결과",
    hidden: true,
  });
  expect(categories).toBeVisible();
  expect(within(categories).getByText("기본 정보")).toBeInTheDocument();
  expect(within(categories).getByText("2개 입력")).toBeInTheDocument();
  expect(within(categories).getByText("학력")).toBeInTheDocument();
  expect(within(categories).getByText("1개 입력")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "입력 완료 3개" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(categories).toBeVisible();
  expect(within(categories).getAllByText("기본 정보")).toHaveLength(1);
  expect(screen.queryByText("학교명")).toBeNull();
  expect(screen.queryByText("전공")).not.toBeInTheDocument();
});

it("defaults to review and switches exclusive result panels with click and keyboard", () => {
  render(
    <WorkflowResults
      reviewItems={[item]}
      results={[{ candidateId: "email", status: "written" }]}
    />,
  );
  const review = screen.getByRole("region", { name: "확인 필요한 항목" });
  expect(screen.queryByRole("region", { name: "입력 완료 내역" })).toBeNull();
  expect(within(review).getByText("전공")).toBeVisible();
  const completedTab = screen.getByRole("tab", { name: "입력 완료 1개" });
  fireEvent.click(completedTab);
  const completed = screen.getByRole("region", { name: "입력 완료 내역" });
  const categories = within(completed).getByRole("list", {
    name: "범주별 입력 결과",
    hidden: true,
  });
  expect(categories).toBeVisible();
  expect(screen.queryByRole("region", { name: "확인 필요한 항목" })).toBeNull();
  expect(completedTab).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(completedTab, { key: "ArrowLeft" });
  expect(screen.getByRole("tab", { name: "확인 필요 1개" })).toHaveFocus();
  expect(within(review).getByText("전공")).toBeVisible();
});
it("keeps an earlier failure visible without locating a reused candidate from another snapshot", () => {
  const onLocate = vi.fn();
  render(
    <WorkflowResults
      reviewItems={[]}
      results={[]}
      onLocate={onLocate}
      progress={[
        {
          id: "stable-major",
          candidateId: "field-1",
          label: "전공",
          category: "학력",
          status: "skipped",
        },
      ]}
    />,
  );
  expect(screen.getByLabelText("확인 필요 1개")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "전공 필드로 이동" }),
  ).toBeDisabled();
  expect(
    screen.getByText(
      "자동으로 입력하지 못했어요. 지원서에서 이 값을 직접 입력해 주세요.",
    ),
  ).toBeInTheDocument();
});

it("shows required review immediately without moving application focus", () => {
  const application = document.createElement("input");
  document.body.append(application);
  application.focus();
  render(
    <WorkflowResults
      reviewItems={[item]}
      results={[{ candidateId: "name", status: "written" }]}
      onLocate={() => {
        application.focus();
        return true;
      }}
    />,
  );
  expect(
    screen.getByRole("region", { name: "확인 필요한 항목" }),
  ).toBeVisible();
  expect(application).toHaveFocus();
  expect(screen.queryByRole("region", { name: "입력 완료 내역" })).toBeNull();
  application.remove();
});

it("treats an empty final progress ledger as zero instead of reviving stale writes", () => {
  render(
    <WorkflowResults
      reviewItems={[]}
      results={[{ candidateId: "stale", status: "written" }]}
      progress={[]}
    />,
  );
  expect(screen.getByLabelText("입력 완료 0개")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "입력한 항목 보기" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "확인 필요 0개" })).toHaveAttribute(
    "aria-selected",
    "false",
  );
  expect(screen.queryByLabelText("입력 실패 0개")).not.toBeInTheDocument();
});

it("shows review without an extra navigation action or automatic scrolling", () => {
  render(
    <div aria-label="테스트 패널" style={{ overflowY: "auto" }}>
      <WorkflowResults reviewItems={[item]} results={[]} />
    </div>,
  );
  const viewport = screen.getByLabelText("테스트 패널");
  const review = screen.getByRole("region", { name: "확인 필요한 항목" });
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 100, 400, 300),
  );
  vi.spyOn(review, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 300, 400, 600),
  );
  viewport.scrollTop = 40;
  const pageScroll = document.documentElement.scrollTop;
  expect(review).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "확인할 항목 보기" }),
  ).not.toBeInTheDocument();
  expect(viewport.scrollTop).toBe(40);
  expect(document.documentElement.scrollTop).toBe(pageScroll);
});

it("does not count unmapped, missing-profile, hidden, or already matching fields as needing review", () => {
  render(
    <WorkflowResults
      reviewItems={[
        {
          ...item,
          candidateId: "unmapped",
          profileValue: undefined,
          previewValue: "입력 예정 값 없음",
        },
        { ...item, candidateId: "same", currentValue: "컴퓨터공학" },
        { ...item, candidateId: "hidden" },
        { ...item, candidateId: "ambiguous" },
      ]}
      results={[]}
      fieldStateFor={(id) => ({
        visible: id !== "hidden",
        value: id === "same" ? "컴퓨터공학" : "",
      })}
    />,
  );
  expect(screen.getByLabelText("확인 필요 1개")).toBeInTheDocument();
  expect(
    screen.getAllByRole("button", { name: "전공 필드로 이동" }),
  ).toHaveLength(1);
});

it("keeps an unverified written mapping only in the review count", () => {
  render(
    <WorkflowResults
      reviewItems={[{ ...item, status: "needs-review" }]}
      results={[{ candidateId: "major", status: "written" }]}
    />,
  );
  expect(screen.getByLabelText("입력 완료 0개")).toBeInTheDocument();
  expect(screen.getByLabelText("확인 필요 1개")).toBeInTheDocument();
});

it("keeps a ready but unwritten field in review when its live value is still blank", () => {
  render(
    <WorkflowResults
      reviewItems={[item]}
      results={[{ candidateId: "major", status: "written" }]}
      progress={[]}
      wasWritten={() => false}
      fieldStateFor={() => ({ visible: true, value: "" })}
    />,
  );
  expect(screen.getByLabelText("확인 필요 1개")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "전공 필드로 이동" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "자동으로 선택하기 어려운 항목이에요. 지원서 목록에서 직접 골라 주세요.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("입력 완료 0개")).toBeInTheDocument();
});

it("does not ask to review an unwritten field whose current value already matches the profile", () => {
  render(
    <WorkflowResults
      reviewItems={[{ ...item, status: "needs-review" }]}
      results={[{ candidateId: "major", status: "written" }]}
      progress={[]}
      wasWritten={() => false}
      fieldStateFor={() => ({ visible: true, value: "컴퓨터공학" })}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "전공 필드로 이동" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "확인할 항목 보기" }),
  ).not.toBeInTheDocument();
});

it("keeps unresolved unapproved items visible and reports unavailable locations", () => {
  render(
    <WorkflowResults
      reviewItems={[item]}
      results={[
        {
          candidateId: "major",
          status: "skipped",
          reason: "사용자가 승인한 입력 항목이 아닙니다.",
        },
      ]}
      onLocate={() => false}
    />,
  );
  expect(screen.getByText("컴퓨터공학")).toBeVisible();
  expect(
    screen.getByText(
      "자동으로 선택하기 어려운 항목이에요. 지원서 목록에서 직접 골라 주세요.",
    ),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "전공 필드로 이동" }));
  expect(screen.getByText("이동 불가")).toBeInTheDocument();
});

it("combines write failures with unresolved fields while masking sensitive values", () => {
  render(
    <WorkflowResults
      reviewItems={[
        {
          ...item,
          candidateId: "salary",
          fieldLabel: "희망 연봉",
          status: "sensitive",
          previewValue: "••••••••",
          profileValue: "5000",
          revealed: false,
        },
      ]}
      results={[
        { candidateId: "name", status: "written" },
        {
          candidateId: "email",
          status: "skipped",
          reason: "네이티브 컨트롤에 안전하게 입력할 수 없습니다.",
        },
      ]}
      onLocate={() => true}
    />,
  );
  expect(screen.getByLabelText("입력 완료 1개")).toBeInTheDocument();
  expect(screen.queryByLabelText("입력 실패 1개")).not.toBeInTheDocument();
  expect(screen.getByLabelText("확인 필요 2개")).toBeInTheDocument();
  expect(
    screen.getByText(
      "자동으로 입력하지 못했어요. 지원서에서 이 값을 직접 입력해 주세요.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("••••••••")).not.toBeInTheDocument();
  expect(screen.queryByText("5000")).not.toBeInTheDocument();
});

it("shows only the live options supplied for an unresolved field", () => {
  render(
    <WorkflowResults
      reviewItems={[item]}
      results={[]}
      optionsFor={() => ["컴퓨터공학부", "컴퓨터공학과"]}
    />,
  );
  expect(screen.getByText("컴퓨터공학부")).toBeInTheDocument();
  expect(screen.getByText("컴퓨터공학과")).toBeInTheDocument();
  expect(screen.getByLabelText("확인 필요 1개")).toBeInTheDocument();
});

it("groups remaining values by section and copies independently of field location", async () => {
  const copyText = vi.fn(async () => undefined);
  const onLocate = vi.fn(() => true);
  render(
    <WorkflowResults
      reviewItems={[
        {
          ...item,
          profileFieldKey: "education.university.majorName",
          itemIndex: 0,
        },
        {
          ...item,
          candidateId: "address",
          fieldLabel: "기본주소",
          profileFieldKey: "contact.contact.addressLine1",
          profileValue: "합성 테스트 주소",
        },
      ]}
      results={[]}
      copyText={copyText}
      onLocate={onLocate}
    />,
  );
  expect(screen.getByRole("heading", { name: "대학교" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "연락처와 주소" })).toBeVisible();
  expect(screen.getByText("컴퓨터공학")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "대학교 / 주전공명 (1) 복사" }),
  );
  await waitFor(() => expect(copyText).toHaveBeenCalledWith("컴퓨터공학"));
  expect(onLocate).not.toHaveBeenCalled();
  expect(await screen.findByText("복사됨")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "대학교 / 주전공명 (1) 필드로 이동" }),
  );
  expect(onLocate).toHaveBeenCalledWith("major");
});

it("keeps unavailable sensitive values masked and uncopyable", () => {
  const copyText = vi.fn(async () => undefined);
  const { container } = render(
    <WorkflowResults
      reviewItems={[
        {
          ...item,
          profileFieldKey: "compensation.compensation.desiredSalary",
          profileValue: "PRIVATE_SALARY",
          revealed: false,
        },
      ]}
      results={[]}
      copyText={copyText}
    />,
  );
  expect(container.innerHTML).not.toContain("PRIVATE_SALARY");
  expect(screen.getByText("값 가림")).toBeVisible();
  const copy = screen.getByRole("button", { name: /복사/ });
  expect(copy).toBeDisabled();
  fireEvent.click(copy);
  expect(copyText).not.toHaveBeenCalled();
});

it("keeps copy failures retryable without exposing raw clipboard errors", async () => {
  const copyText = vi
    .fn()
    .mockRejectedValueOnce(new Error("PRIVATE_CLIPBOARD_ERROR"))
    .mockResolvedValueOnce(undefined);
  render(
    <WorkflowResults reviewItems={[item]} results={[]} copyText={copyText} />,
  );
  const copy = screen.getByRole("button", { name: "전공 복사" });
  fireEvent.click(copy);
  expect(await screen.findByRole("alert")).not.toHaveTextContent(
    "PRIVATE_CLIPBOARD_ERROR",
  );
  fireEvent.click(copy);
  expect(await screen.findByText("복사됨")).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("keeps ambiguous saved records separately copyable without picking a write target", async () => {
  const profile = createEmptyProfile();
  profile.education = [
    {
      id: "first",
      sectionId: "university",
      values: { majorName: "첫 합성 전공" },
    },
    {
      id: "second",
      sectionId: "university",
      values: { majorName: "두 번째 합성 전공" },
    },
  ];
  const copyText = vi.fn(async () => undefined);
  render(
    <WorkflowResults
      reviewItems={[
        {
          ...item,
          profileValue: undefined,
          profileFieldKey: "education.university.majorName",
          revealed: false,
        },
      ]}
      profile={profile}
      results={[]}
      copyText={copyText}
    />,
  );
  expect(screen.getByText("첫 합성 전공")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "대학교 / 주전공명 값 2 복사" }),
  );
  await waitFor(() =>
    expect(copyText).toHaveBeenCalledWith("두 번째 합성 전공"),
  );
  expect(screen.queryByRole("textbox")).toBeNull();
});

it("makes completed values reviewable and locates the field without claiming verification", () => {
  const onLocate = vi.fn(() => false);
  render(
    <WorkflowResults
      reviewItems={[item]}
      results={[{ candidateId: "major", status: "written" }]}
      fieldStateFor={() => ({ visible: true, value: "컴퓨터공학" })}
      onLocateSection={onLocate}
    />,
  );
  const region = screen.getByRole("region", { name: "입력 완료 내역" });
  expect(within(region).queryByText("컴퓨터공학")).toBeNull();
  expect(
    within(region).getByRole("button", { name: "기타 항목 구역 보기" }),
  ).toBeEnabled();
  expect(within(region).getByText(/구역을 눌러 지원서에서/)).toBeVisible();
  fireEvent.click(
    within(region).getByRole("button", { name: "기타 항목 구역 보기" }),
  );
  expect(onLocate).toHaveBeenCalledWith(["major"], "기타 항목");
  expect(
    within(region).getByRole("button", { name: "기타 항목 구역 보기" }),
  ).toBeDisabled();
  expect(
    within(region).getByText(
      "이 구역으로 이동할 수 없어요. 지원서에서 직접 확인해 주세요.",
    ),
  ).toBeVisible();
});
it("masks unrevealed sensitive completed values including tooltips", () => {
  const value = "synthetic-private-completed";
  const { container } = render(
    <WorkflowResults
      reviewItems={[
        {
          ...item,
          profileFieldKey: "compensation.compensation.desiredSalary",
          profileValue: value,
          previewValue: value,
          revealed: false,
        },
      ]}
      results={[{ candidateId: "major", status: "written" }]}
      fieldStateFor={() => ({ visible: true, value })}
    />,
  );
  expect(screen.queryByText("값 가림")).toBeNull();
  expect(container.innerHTML).not.toContain(value);
});
