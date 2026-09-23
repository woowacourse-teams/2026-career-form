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
    const primary = view.getByRole("button", { name: "확인할 항목 보기" });
    const locate = view.getByRole("button", { name: "전공 필드로 이동" });

    expect(getComputedStyle(summary).display).toBe("grid");
    expect(getComputedStyle(summary).padding).toBe("16px");
    expect(getComputedStyle(counts).display).toBe("flex");
    expect(getComputedStyle(counts).gap).toBe("8px 16px");
    expect(getComputedStyle(primary).display).toBe("flex");
    expect(getComputedStyle(primary).borderRadius).toBe("8px");
    expect(getComputedStyle(locate).padding).toBe("3px 7px");
    expect(getComputedStyle(locate).borderRadius).toBe("6px");
  } finally {
    externalStyles.forEach((style) => document.head.append(style));
  }
});

it("places the field name, full value, and compact action in one grid row with the reason below", () => {
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
  const heading = locate.parentElement!;
  const preview = view.getByText(value);
  const reason = view.getByText("선택 필요");

  expect(getComputedStyle(heading).display).toBe("grid");
  expect(getComputedStyle(heading).gridTemplateColumns).toBe(
    "minmax(0, 0.8fr) minmax(0, 1.2fr) auto",
  );
  expect(heading).toContainElement(view.getByText("전공"));
  expect(heading).toContainElement(preview);
  expect(heading).not.toContainElement(reason);
  expect(heading.nextElementSibling).toBe(reason);
  expect(getComputedStyle(preview.parentElement!).minWidth).toBe("0px");
  expect(getComputedStyle(preview).whiteSpace).toBe("pre-wrap");
  expect(getComputedStyle(preview).overflowWrap).toBe("anywhere");
  expect(getComputedStyle(preview).textOverflow).not.toBe("ellipsis");
  expect(getComputedStyle(preview).overflow).not.toBe("hidden");
  expect(getComputedStyle(locate).minHeight).toBe("28px");
  expect(getComputedStyle(locate.closest("article")!).padding).toBe("10px 0px");
});
