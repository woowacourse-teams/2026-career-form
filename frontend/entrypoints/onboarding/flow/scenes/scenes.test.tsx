import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FILL_PHASES, FILL_STILL, FillScene, fillChapter } from "./FillScene";

const field = (container: HTMLElement, label: string) =>
  container.querySelector<HTMLElement>(`[data-field="${label}"]`)
    ?.textContent ?? "";
const panel = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-panel]");

describe("FillScene", () => {
  it("빈 Greeting 양식과 페이지의 Career Form 버튼에서 시작한다", () => {
    const { container } = render(<FillScene phase={0} />);
    expect(container.textContent).toContain("[신입] 백엔드 개발자 채용");
    expect(container.textContent).toContain("기본정보");
    expect(container.textContent).toContain("제출하기");
    expect(field(container, "이름")).toBe("");
    expect(container.querySelector('[data-cursor="launcher"]')).not.toBeNull();
    expect(panel(container)).toHaveAttribute("data-open", "false");
  });
  it("버튼을 누르면 패널이 열리고 자동 기입을 누르면 칸이 하나씩 채워진다", () => {
    const opened = render(<FillScene phase={3} />);
    expect(panel(opened.container)).toHaveAttribute("data-open", "true");
    expect(
      within(panel(opened.container)!).getByText("자동 기입", {
        selector: "[data-cursor='autofill']",
      }),
    ).toBeInTheDocument();
    opened.unmount();
    const filling = render(<FillScene phase={8} />);
    expect(field(filling.container, "이름")).toBe("김하늘");
    expect(field(filling.container, "영문이름")).toBe("Kim Haneul");
    expect(field(filling.container, "성별")).toBe("선택");
    expect(filling.container.textContent).toContain("지원서를 채우고 있어요");
    expect(filling.container.textContent).toContain("50%");
  });
  it("다 채우면 패널에 확인 필요와 입력 완료가 보인다", () => {
    const { container } = render(<FillScene phase={FILL_STILL} />);
    expect(field(container, "생년월일")).toBe("2000-02-23");
    expect(within(panel(container)!).getByText("확인 필요")).toBeTruthy();
    expect(within(panel(container)!).getByText("입력 완료")).toBeTruthy();
    expect(panel(container)!.textContent).toContain("사진");
  });
  it("단계는 지원서 열기, 자동 기입, 확인 세 묶음으로 나뉜다", () => {
    expect(fillChapter(0)).toBe(0);
    expect(fillChapter(1)).toBe(1);
    expect(fillChapter(10)).toBe(1);
    expect(fillChapter(FILL_STILL)).toBe(2);
    expect(fillChapter(FILL_PHASES.length - 1)).toBe(2);
  });
});
