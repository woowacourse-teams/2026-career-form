import { render, screen, within } from "@testing-library/react";
import { ImportSourceChoice } from "../../../../src/profile/resume-import/ImportSourceChoice";
import { describe, expect, it } from "vitest";
import { FILL_PHASES, FILL_STILL, FillScene, fillChapter } from "./FillScene";
import {
  IMPORT_PHASES,
  IMPORT_STILL,
  ImportScene,
  importChapter,
} from "./ImportScene";

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

describe("ImportScene", () => {
  it("이미 써 둔 Greeting 지원서에서 시작한다", () => {
    const { container } = render(<ImportScene phase={0} />);
    expect(field(container, "이름")).toBe("김하늘");
    expect(field(container, "영문이름")).toBe("Kim Haneul");
    expect(panel(container)).toHaveAttribute("data-open", "false");
  });
  it("톱니바퀴를 누르면 프로필 가져오기 메뉴가 열린다", () => {
    const { container } = render(<ImportScene phase={6} />);
    const menu = container.querySelector('[data-cursor="menu-import"]');
    expect(menu).toHaveTextContent("프로필 가져오기");
  });
  it("프로필 가져오기를 누르면 출처 고르기 화면이 나오고 지원서 화면을 누른다", () => {
    const menu = render(<ImportScene phase={7} />);
    expect(
      menu.container.querySelector('[data-cursor="menu-import"]'),
    ).toHaveAttribute("data-pressed", "true");
    menu.unmount();
    const choice = render(<ImportScene phase={8} />);
    const sources = panel(choice.container)!;
    expect(sources.textContent).not.toContain("개 가져오기");
    expect(
      [...sources.querySelectorAll("[data-source] b")].map(
        (b) => b.textContent,
      ),
    ).toEqual(["지원서 화면", "이력서 파일"]);
    choice.unmount();
    const click = render(<ImportScene phase={10} />);
    expect(
      click.container.querySelector('[data-cursor="source-page"]'),
    ).toHaveAttribute("data-pressed", "true");
    click.unmount();
    const review = render(<ImportScene phase={11} />);
    expect(panel(review.container)!.textContent).toContain("5개 가져오기");
  });
  it("출처 고르기 장면은 실제 출처 고르기 화면과 이름, 설명, 순서가 같다", () => {
    const real = render(
      <ImportSourceChoice onPage={() => {}} onResume={() => {}} />,
    );
    const expected = screen
      .getAllByRole("button")
      .map((button) => [
        button.querySelector("b")!.textContent,
        button.querySelector("small")!.textContent,
      ]);
    real.unmount();
    const { container } = render(<ImportScene phase={8} />);
    expect(
      [...container.querySelectorAll("[data-source]")].map((item) => [
        item.querySelector("b")!.textContent,
        item.querySelector("small")!.textContent,
      ]),
    ).toEqual(expected);
  });
  it("가져오기 화면은 확인할 항목을 묻고 확인하면 개수가 늘어난다", () => {
    const pending = render(<ImportScene phase={11} />);
    const review = panel(pending.container)!;
    expect(review.textContent).toContain("5개 가져오기");
    expect(review.textContent).toContain("이렇게 나눌까요?");
    expect(review.textContent).toContain("확인하지 않은 1개는 빼고 저장해요");
    pending.unmount();
    const confirmed = render(<ImportScene phase={IMPORT_STILL} />);
    const after = panel(confirmed.container)!;
    expect(after.textContent).toContain("6개 가져오기");
    expect(after.textContent).not.toContain("이렇게 나눌까요?");
    expect(after.textContent).toContain("프로필에 저장 6");
  });
  it("저장하면 프로필에 저장했다고 알린다", () => {
    const { container } = render(<ImportScene phase={17} />);
    expect(panel(container)!.textContent).toContain(
      "프로필에 6개를 저장했어요",
    );
  });
  it("단계는 창 열기, 톱니바퀴 메뉴와 출처 고르기, 확인과 저장 세 묶음으로 나뉜다", () => {
    expect(importChapter(0)).toBe(0);
    expect(importChapter(3)).toBe(0);
    expect(importChapter(4)).toBe(1);
    expect(importChapter(10)).toBe(1);
    expect(importChapter(11)).toBe(2);
    expect(importChapter(IMPORT_PHASES.length - 1)).toBe(2);
  });
  it("움직임 줄이기 정지 화면은 확인을 마친 가져오기 화면이다", () => {
    expect(importChapter(IMPORT_STILL)).toBe(2);
    const { container } = render(<ImportScene phase={IMPORT_STILL} />);
    expect(panel(container)!.textContent).toContain("6개 가져오기");
    expect(container.querySelector("[data-source]")).toBeNull();
  });
});
