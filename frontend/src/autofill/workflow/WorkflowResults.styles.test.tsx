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
    expect(getComputedStyle(locate).padding).toBe("7px 10px");
    expect(getComputedStyle(locate).borderRadius).toBe("7px");
  } finally {
    externalStyles.forEach((style) => document.head.append(style));
  }
});
