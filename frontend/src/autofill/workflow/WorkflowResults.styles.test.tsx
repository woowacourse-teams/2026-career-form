import { render, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { WorkflowResults } from "./WorkflowResults";

it("keeps result layout and actions styled without the separately loaded entry stylesheet", () => {
  // Vite normally injects imported CSS into the test document's head. The
  // content script instead fetches its entry CSS when opening its shadow UI.
  // Remove those external styles to exercise the component's own stylesheet.
  const externalStyles = [...document.head.querySelectorAll("style")];
  externalStyles.forEach((style) => style.remove());
  try {
    const { container } = render(
      <WorkflowResults
        reviewItems={[
          {
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
          },
        ]}
        results={[{ candidateId: "name", status: "written" }]}
        onLocate={() => true}
      />,
    );
    const view = within(container);
    const summary = view.getByRole("status").parentElement!;
    const counts = view.getByLabelText("입력 완료 1개").parentElement!;
    const locate = view.getByRole("button", { name: "전공 필드로 이동" });

    expect(getComputedStyle(summary).display).toBe("grid");
    expect(getComputedStyle(summary).padding).toBe("0px");
    expect(getComputedStyle(counts).display).toBe("grid");
    expect(counts).toHaveAttribute("role", "tablist");
    expect(getComputedStyle(counts.firstElementChild!).borderTopStyle).toBe(
      "none",
    );
    expect(getComputedStyle(counts.lastElementChild!).borderLeftStyle).toBe(
      "none",
    );
    expect(locate).toHaveTextContent("전공");
    expect(view.getByRole("button", { name: "전공 복사" })).toBeVisible();
    expect(getComputedStyle(locate).minHeight).toBe("32px");
    expect(getComputedStyle(locate).borderTopStyle).toBe("none");
  } finally {
    externalStyles.forEach((style) => document.head.append(style));
  }
});

it("lays out a plain field row with an ellipsized value and separate copy action", () => {
  const value =
    "컴퓨터공학과에서소프트웨어시스템설계와분산데이터처리를전공했습니다";
  const { container } = render(
    <WorkflowResults
      reviewItems={[
        {
          candidateId: "major",
          fieldLabel: "전공",
          currentValue: "",
          previewValue: value,
          profileValue: value,
          status: "unavailable",
          selected: false,
          disabled: true,
          revealed: true,
          reason: "후보 여러 개",
        },
      ]}
      results={[]}
      onLocate={() => true}
    />,
  );
  const view = within(container);
  const locate = view.getByRole("button", { name: "전공 필드로 이동" });
  const heading = locate.parentElement!.parentElement!;
  expect(view.getByText(value)).toBeVisible();
  const reason = view.getByText(
    "자동으로 선택하기 어려운 항목이에요. 지원서 목록에서 직접 골라 주세요.",
  );

  expect(getComputedStyle(heading).display).toBe("grid");
  expect(getComputedStyle(heading).gridTemplateColumns).toBe(
    "minmax(0, 0.8fr) minmax(0, 1.2fr)",
  );
  expect(heading).toContainElement(view.getByText("전공"));
  expect(heading).not.toContainElement(reason);
  expect(heading.nextElementSibling).toBe(reason);
  expect(getComputedStyle(locate).minHeight).toBe("32px");
  const rowStyle = getComputedStyle(locate.closest("article")!);
  expect(rowStyle.paddingTop).toBe("10px");
  expect(rowStyle.paddingLeft).toBe("0px");
  const valueStyle = getComputedStyle(view.getByText(value));
  expect(valueStyle.whiteSpace).toBe("nowrap");
  expect(valueStyle.textOverflow).toBe("ellipsis");
  expect(view.getByText(value)).toHaveAttribute("title", value);
  expect(heading).toContainElement(
    view.getByRole("button", { name: "전공 복사" }),
  );
  expect(getComputedStyle(reason).wordBreak).toBe("keep-all");
  expect(getComputedStyle(reason).fontSize).toBe("12px");
  expect(view.queryByText("확인 안내")).not.toBeInTheDocument();
});
