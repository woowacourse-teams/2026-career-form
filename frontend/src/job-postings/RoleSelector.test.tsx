import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { JobCategoriesView } from "./job-roles";
import type { JobCategories } from "./push-api";
import { RoleSelector } from "./RoleSelector";

const categories: JobCategories = {
  version: 1,
  categories: [
    {
      code: "IT",
      label: "IT/개발",
      roles: [
        { code: "IT.BACKEND", label: "백엔드" },
        { code: "IT.FRONTEND", label: "프론트엔드" },
      ],
    },
    {
      code: "DESIGN",
      label: "디자인",
      roles: [{ code: "DESIGN.UX_UI", label: "UX/UI" }],
    },
    {
      code: "MARKETING",
      label: "마케팅",
      roles: [{ code: "MARKETING.CONTENT", label: "콘텐츠" }],
    },
  ],
};
const ready: JobCategoriesView = { categories, error: null };

function renderSelector(
  options: {
    view?: JobCategoriesView;
    selected?: string[];
    loading?: boolean;
    saved?: boolean;
  } = {},
) {
  const onChange = vi.fn(async () => options.saved ?? true);
  const onReload = vi.fn(async () => {});
  const view = render(
    <RoleSelector
      view={"view" in options ? options.view : ready}
      loading={options.loading ?? false}
      selected={options.selected ?? []}
      busy={false}
      onChange={onChange}
      onReload={onReload}
    />,
  );
  return { onChange, onReload, rerender: view.rerender };
}
const tab = (name: RegExp | string) => screen.getByRole("tab", { name });
const box = (name: string) => screen.getByRole("checkbox", { name });

describe("RoleSelector", () => {
  it("대분류를 세로 탭으로, 고른 대분류의 소분류를 체크박스로 보여 준다", () => {
    renderSelector();
    const list = screen.getByRole("tablist", { name: "대분류" });
    expect(list).toHaveAttribute("aria-orientation", "vertical");
    expect(
      within(list)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["IT/개발", "디자인", "마케팅"]);
    expect(tab("IT/개발")).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(box("IT/개발 전체")).not.toBeChecked();
    expect(box("백엔드")).not.toBeChecked();
    expect(box("프론트엔드")).not.toBeChecked();
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      tab("IT/개발").id,
    );
    expect(screen.getByText("받을 직무를 고르세요")).toBeInTheDocument();
  });
  it("방향키와 Home·End로 대분류를 옮기면 소분류가 바뀐다", () => {
    renderSelector();
    tab("IT/개발").focus();
    fireEvent.keyDown(tab("IT/개발"), { key: "ArrowDown" });
    expect(tab("디자인")).toHaveAttribute("aria-selected", "true");
    expect(tab("디자인")).toHaveFocus();
    expect(tab("디자인")).toHaveAttribute("tabindex", "0");
    expect(tab("IT/개발")).toHaveAttribute("tabindex", "-1");
    expect(box("UX/UI")).toBeInTheDocument();
    fireEvent.keyDown(tab("디자인"), { key: "ArrowUp" });
    expect(tab("IT/개발")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab("IT/개발"), { key: "ArrowUp" });
    expect(tab("마케팅")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab("마케팅"), { key: "Home" });
    expect(tab("IT/개발")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab("IT/개발"), { key: "End" });
    expect(tab("마케팅")).toHaveAttribute("aria-selected", "true");
    expect(box("콘텐츠")).toBeInTheDocument();
  });
  it("소분류를 고르면 바로 저장하고 선택 개수를 대분류와 제목 옆에 보여 준다", async () => {
    const onChange = vi.fn(async () => true);
    const props = {
      view: ready,
      loading: false,
      busy: false,
      onChange,
      onReload: vi.fn(async () => {}),
    };
    const { rerender } = render(
      <RoleSelector {...props} selected={["DESIGN.UX_UI"]} />,
    );
    expect(screen.getByText("1개 선택")).toBeInTheDocument();
    expect(tab("디자인 1")).toHaveAttribute("aria-selected", "true");
    fireEvent.click(tab("IT/개발"));
    fireEvent.click(box("백엔드"));
    expect(box("백엔드")).toBeChecked();
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(["DESIGN.UX_UI", "IT.BACKEND"]),
    );
    rerender(
      <RoleSelector {...props} selected={["DESIGN.UX_UI", "IT.BACKEND"]} />,
    );
    expect(screen.getByText("2개 선택")).toBeInTheDocument();
    expect(tab("IT/개발 1")).toHaveAttribute("aria-selected", "true");
    fireEvent.click(box("백엔드"));
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(["DESIGN.UX_UI"]),
    );
    expect(screen.queryByText("받을 직무를 고르세요")).toBeNull();
  });
  it("대분류 전체 체크박스로 소분류를 한 번에 고르고 해제하며 일부면 중간 상태다", async () => {
    const onChange = vi.fn(async () => true);
    const props = {
      view: ready,
      loading: false,
      busy: false,
      onChange,
      onReload: vi.fn(async () => {}),
    };
    const { rerender } = render(
      <RoleSelector {...props} selected={["DESIGN.UX_UI"]} />,
    );
    fireEvent.click(tab("IT/개발"));
    const all = box("IT/개발 전체") as HTMLInputElement;
    expect(all).not.toBeChecked();
    expect(all.indeterminate).toBe(false);
    fireEvent.click(all);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        "DESIGN.UX_UI",
        "IT.BACKEND",
        "IT.FRONTEND",
      ]),
    );
    rerender(
      <RoleSelector
        {...props}
        selected={["DESIGN.UX_UI", "IT.BACKEND", "IT.FRONTEND"]}
      />,
    );
    expect(box("IT/개발 전체")).toBeChecked();
    expect(box("백엔드")).toBeChecked();
    expect(tab("IT/개발 2")).toHaveAttribute("aria-selected", "true");
    fireEvent.click(box("프론트엔드"));
    rerender(
      <RoleSelector {...props} selected={["DESIGN.UX_UI", "IT.BACKEND"]} />,
    );
    const partial = box("IT/개발 전체") as HTMLInputElement;
    expect(partial).not.toBeChecked();
    expect(partial.indeterminate).toBe(true);
    fireEvent.click(partial);
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        "DESIGN.UX_UI",
        "IT.BACKEND",
        "IT.FRONTEND",
      ]),
    );
    rerender(
      <RoleSelector
        {...props}
        selected={["DESIGN.UX_UI", "IT.BACKEND", "IT.FRONTEND"]}
      />,
    );
    fireEvent.click(box("IT/개발 전체"));
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(["DESIGN.UX_UI"]),
    );
  });
  it("저장 결과가 돌아오면 전달받은 선택값을 따른다", async () => {
    let resolve = (_ok: boolean) => {};
    const onChange = vi.fn(
      () =>
        new Promise<boolean>((r) => {
          resolve = r;
        }),
    );
    const onReload = vi.fn(async () => {});
    const props = {
      view: ready,
      loading: false,
      busy: false,
      onChange,
      onReload,
    };
    const { rerender } = render(<RoleSelector {...props} selected={[]} />);
    fireEvent.click(box("프론트엔드"));
    expect(box("프론트엔드")).toBeChecked();
    rerender(<RoleSelector {...props} selected={["IT.FRONTEND"]} />);
    resolve(true);
    await waitFor(() => expect(box("프론트엔드")).toBeChecked());
    expect(screen.getByText("1개 선택")).toBeInTheDocument();
  });
  it("저장에 실패하면 이전 선택으로 되돌리고 짧게 알린다", async () => {
    const { onChange } = renderSelector({ saved: false });
    fireEvent.click(box("백엔드"));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(box("백엔드")).not.toBeChecked());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "선택을 저장하지 못했어요",
    );
    fireEvent.click(box("백엔드"));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
  });
  it("불러오는 동안은 안내만 보인다", () => {
    renderSelector({ view: undefined, loading: true });
    expect(screen.getByText("직무 분류 불러오는 중")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
  });
  it.each([
    ["NOT_CONFIGURED", "알림 서버 없음", false],
    ["ENDPOINT_UNAVAILABLE", "서버 미지원", true],
    ["NETWORK", "직무 분류를 불러오지 못했어요", true],
    ["SERVER_ERROR", "직무 분류를 불러오지 못했어요", true],
  ] as const)(
    "분류가 없고 오류 %s면 %s를 보여 준다",
    async (error, text, retry) => {
      const { onReload } = renderSelector({
        view: { categories: null, error },
      });
      expect(screen.getByRole("status")).toHaveTextContent(text);
      expect(screen.queryByRole("tablist")).toBeNull();
      expect(screen.queryByText("받을 직무를 고르세요")).toBeNull();
      const button = screen.queryByRole("button", { name: "다시 시도" });
      expect(button !== null).toBe(retry);
      if (button) {
        fireEvent.click(button);
        await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
      }
    },
  );
  it("서버 조회에 실패해도 저장된 분류로 고를 수 있고 이유를 함께 보여 준다", async () => {
    const { onChange, onReload } = renderSelector({
      view: { categories, error: "ENDPOINT_UNAVAILABLE" },
      selected: ["IT.BACKEND"],
    });
    expect(
      screen.getByText("저장된 분류 사용 중 · 서버 미지원"),
    ).toBeInTheDocument();
    expect(box("백엔드")).toBeChecked();
    fireEvent.click(box("프론트엔드"));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(["IT.BACKEND", "IT.FRONTEND"]),
    );
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
  });
  it("분류 코드에 없는 선택값은 개수에 세지 않는다", () => {
    renderSelector({ selected: ["IT.BACKEND", "IT.GONE"] });
    expect(screen.getByText("1개 선택")).toBeInTheDocument();
  });
});
