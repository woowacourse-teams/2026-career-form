import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { POSTINGS_KEY } from "../../src/job-postings/repository";
import type { Posting } from "../../src/job-postings/model";
import { createSavedPostingsReader } from "../../src/job-postings/saved-postings";
import { createEmptyProfile } from "../../src/profile/model";
import { App } from "./App";

const kst = (value: string) => Date.parse(`${value}+09:00`);
const NOW = kst("2026-11-02T10:00:00");

function posting(id: string, deadline: string, extra: Partial<Posting> = {}) {
  return {
    id,
    version: 1,
    company: `예시 회사 ${id}`,
    role: "프론트엔드",
    url: `https://example.test/${id}`,
    deadline: kst(deadline),
    timeZone: "Asia/Seoul",
    status: "planned",
    reminders: [],
    updatedAt: 1,
    ...extra,
  } satisfies Posting;
}

/** Real reader and parser over an in-memory stand-in for browser storage. */
function storedPostings(postings: Posting[]) {
  let stored: unknown = { schemaVersion: 1, postings };
  let failing = false;
  const listeners = new Set<
    (changes: Record<string, unknown>, area: string) => void
  >();
  return {
    reader: createSavedPostingsReader({
      storage: {
        get: async () => {
          if (failing) throw new Error("storage unavailable");
          return { [POSTINGS_KEY]: stored };
        },
      },
      onChanged: {
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener),
      },
    }),
    fail: (value: boolean) => {
      failing = value;
    },
    change: (next: Posting[]) => {
      stored = { schemaVersion: 1, postings: next };
      listeners.forEach((listener) =>
        listener({ [POSTINGS_KEY]: { newValue: stored } }, "local"),
      );
    },
  };
}

function repository() {
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "지원";
  profile.contact.email = "copy@example.com";
  return {
    load: async () => profile,
    save: async () => undefined,
    loadLayout: async () => "a" as const,
    saveLayout: async () => undefined,
  };
}

function renderApp(
  props: Partial<Parameters<typeof App>[0]> = {},
  postings: Posting[] = [],
) {
  const storage = storedPostings(postings);
  const view = render(
    <App
      repository={repository()}
      track={vi.fn()}
      savedPostings={storage.reader}
      unreadPostings={{ count: async () => 0, subscribe: () => () => {} }}
      now={() => NOW}
      {...props}
    />,
  );
  return { ...view, storage };
}

const tab = (name: RegExp | string) => screen.getByRole("tab", { name });
const settings = () => screen.getByRole("button", { name: "설정" });

/** Inline declarations the panel stylesheet gives an element, in source order. */
function declared(element: Element, property: string) {
  const value = [...document.styleSheets]
    .flatMap((sheet) => [...sheet.cssRules])
    .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
    .filter((rule) => element.matches(rule.selectorText))
    .map((rule) => rule.style.getPropertyValue(property))
    .filter(Boolean)
    .at(-1);
  if (!value) throw new Error(`Missing ${property} declaration`);
  return value;
}

describe("header", () => {
  it("shows only the logo, settings and close, without the old titles and buttons", async () => {
    renderApp();
    await screen.findByRole("tablist");

    expect(screen.getByRole("img", { name: "커리어폼" })).toBeVisible();
    const close = screen.getByRole("button", { name: "닫기" });
    expect(
      settings().compareDocumentPosition(close) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    for (const removed of ["CAREER FORM", "지원서 패널", "내 지원 정보"])
      expect(screen.queryByText(removed)).toBeNull();
    expect(screen.queryByRole("button", { name: /프로필 관리/ })).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: /지원 공고 관리/ })).toBeNull();
  });

  it("keeps the workflow screen's own header", async () => {
    renderApp({ autofillView: <p>진행 화면</p>, returnToProfile: vi.fn() });
    await screen.findByText("진행 화면");

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("button", { name: "설정" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "자동 기입" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "수동 복사로 돌아가기" }),
    ).toBeVisible();
  });
});

describe("settings menu", () => {
  it("is closed until the button opens it", async () => {
    renderApp({ readImportCandidates: async () => [] });
    await screen.findByRole("tablist");

    expect(settings()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "프로필 관리" })).toBeNull();
    fireEvent.click(settings());
    expect(settings()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "프로필 관리" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "프로필 가져오기" }),
    ).toBeVisible();
  });

  it("offers import only when the page can provide candidates", async () => {
    renderApp();
    fireEvent.click(settings());

    expect(screen.getByRole("button", { name: "프로필 관리" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "프로필 가져오기" }),
    ).toBeNull();
  });

  it("closes on Escape and returns focus to the button", async () => {
    renderApp();
    fireEvent.click(settings());
    const item = screen.getByRole("button", { name: "프로필 관리" });
    item.focus();

    fireEvent.keyDown(item, { key: "Escape" });

    expect(screen.queryByRole("button", { name: "프로필 관리" })).toBeNull();
    expect(settings()).toHaveFocus();
    expect(settings()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on an outside click and returns focus to the button", async () => {
    renderApp();
    fireEvent.click(settings());
    screen.getByRole("button", { name: "프로필 관리" }).focus();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("button", { name: "프로필 관리" })).toBeNull();
    expect(settings()).toHaveFocus();
  });

  it("stays open for a click inside the menu", async () => {
    renderApp();
    fireEvent.click(settings());
    const item = screen.getByRole("button", { name: "프로필 관리" });

    fireEvent.pointerDown(item);

    expect(item).toBeInTheDocument();
  });

  it("opens profile management, closes itself and tracks the click", async () => {
    const openOptions = vi.fn(async () => undefined);
    const track = vi.fn();
    renderApp({ openOptions, track });
    fireEvent.click(settings());

    fireEvent.click(screen.getByRole("button", { name: "프로필 관리" }));

    expect(openOptions).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith("profile_management_clicked", {
      surface: "side_panel",
    });
    expect(screen.queryByRole("button", { name: "프로필 관리" })).toBeNull();
    expect(settings()).toHaveFocus();
  });

  it("keeps a profile management failure visible as an alert after closing", async () => {
    renderApp({
      openOptions: async () => {
        throw new Error("unavailable");
      },
    });
    fireEvent.click(settings());
    fireEvent.click(screen.getByRole("button", { name: "프로필 관리" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "프로필 관리 화면을 열지 못했습니다",
    );
  });

  it("opens the import view from the menu and tracks it", async () => {
    const track = vi.fn();
    renderApp({ track, readImportCandidates: async () => [] });
    fireEvent.click(settings());

    fireEvent.click(screen.getByRole("button", { name: "프로필 가져오기" }));

    expect(
      screen.getByRole("main", { name: "프로필 가져오기 화면" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(track).toHaveBeenCalledWith("greeting_import_viewed", {
      surface: "side_panel",
    });
    await act(async () => undefined);
  });

  it("shows the panel shortcut hint inside the menu", async () => {
    renderApp({ readPanelShortcut: async () => "Alt+Shift+C" });
    await screen.findByRole("tablist");
    expect(screen.queryByText(/이 패널을 열고 닫을 수 있어요/)).toBeNull();

    fireEvent.click(settings());

    const hint = await screen.findByText(/로 이 패널을 열고 닫을 수 있어요/);
    expect(hint.querySelector("kbd")).toHaveTextContent("Alt+Shift+C");
  });
});

describe("tabs", () => {
  it("exposes three tabs in order with 자동 기입 selected on open", async () => {
    renderApp();
    const tablist = await screen.findByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");

    expect(tabs.map((item) => item.textContent)).toEqual([
      "자동 기입",
      "마감 공고",
      "내 정보",
    ]);
    expect(tab("자동 기입")).toHaveAttribute("aria-selected", "true");
    expect(tab("마감 공고")).toHaveAttribute("aria-selected", "false");
    expect(tab("내 정보")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("자동 기입");
    expect(tab("자동 기입")).toHaveAttribute(
      "aria-controls",
      screen.getByRole("tabpanel").id,
    );
  });

  it("switches panels by click", async () => {
    renderApp();
    fireEvent.click(tab("내 정보"));

    expect(tab("내 정보")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("내 정보");
    expect(
      screen.queryByRole("button", { name: "자동 기입" }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("copy@example.com")).toBeVisible();
  });

  it("moves with Left and Right arrows, wrapping at the ends, with a roving tab stop", async () => {
    renderApp();
    await screen.findByRole("tablist");

    tab("자동 기입").focus();
    fireEvent.keyDown(tab("자동 기입"), { key: "ArrowRight" });
    expect(tab("마감 공고")).toHaveFocus();
    expect(tab("마감 공고")).toHaveAttribute("aria-selected", "true");
    expect(tab("마감 공고")).toHaveAttribute("tabindex", "0");
    expect(tab("자동 기입")).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(tab("마감 공고"), { key: "ArrowRight" });
    expect(tab("내 정보")).toHaveFocus();
    fireEvent.keyDown(tab("내 정보"), { key: "ArrowRight" });
    expect(tab("자동 기입")).toHaveFocus();
    fireEvent.keyDown(tab("자동 기입"), { key: "ArrowLeft" });
    expect(tab("내 정보")).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("내 정보");
    await screen.findByText("copy@example.com");
  });

  it("hides the postings tab when postings are not shown and skips it by keyboard", async () => {
    renderApp({ showPostings: false });

    expect(screen.queryByRole("tab", { name: /마감 공고/ })).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    tab("자동 기입").focus();
    fireEvent.keyDown(tab("자동 기입"), { key: "ArrowRight" });
    expect(tab("내 정보")).toHaveFocus();
    await screen.findByText("copy@example.com");
  });

  it("underlines the selected tab's label in the text color at 2px", async () => {
    renderApp();
    await screen.findByRole("tablist");
    const selected = tab("자동 기입");

    expect(getComputedStyle(selected).fontWeight).toBe("600");
    expect(getComputedStyle(tab("내 정보")).fontWeight).toBe("400");
    const css = [...document.querySelectorAll("style")]
      .map((style) => style.textContent)
      .join("");
    const underline = css.match(
      /\[aria-selected="?true"?\]\s+\S*tabLabel\S*::after\s*{([^}]*)}/,
    )?.[1];
    expect(underline).toContain("height: 2px");
    expect(underline).toContain("var(--color-text-strong)");
  });
});

describe("자동 기입 tab", () => {
  it("holds only the start button with its label and specified size", async () => {
    const { container } = renderApp({ readImportCandidates: async () => [] });
    const start = await screen.findByRole("button", { name: "자동 기입" });

    expect(start.textContent).toBe("자동 기입");
    expect(start).toHaveAttribute("data-autofill-start");
    expect(screen.getByRole("tabpanel")).toContainElement(start);
    expect(
      within(screen.getByRole("tabpanel")).getAllByRole("button"),
    ).toHaveLength(1);
    expect(declared(start, "height")).toBe("44px");
    expect(declared(start, "padding")).toBe("11px 21px");
    expect(declared(start, "border-radius")).toBe("980px");
    expect(declared(start, "font-size")).toBe("17px");
    expect(declared(start, "font-weight")).toBe("400");
    expect(declared(start, "width")).toBe("fit-content");
    expect(declared(start, "background")).toBe("var(--color-brand)");
    expect(container.textContent).not.toContain("지원서에서 가져오기");
    expect(container.textContent).not.toContain("Greeting 지원서");
  });

  it("disables while pending and reports a failed start", async () => {
    let fail!: (reason: Error) => void;
    renderApp({
      openAutofill: () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    });
    const start = await screen.findByRole("button", { name: "자동 기입" });

    fireEvent.click(start);
    expect(start).toBeDisabled();
    await act(async () => fail(new Error("unavailable")));

    expect(start).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "현재 페이지에 자동 기입 화면을 열지 못했습니다",
    );
    expect(screen.getByRole("tabpanel")).toContainElement(
      screen.getByRole("alert"),
    );
  });

  it("returns to the start button after a workflow begun from another tab", async () => {
    const common = { repository: repository(), track: vi.fn() };
    const saved = storedPostings([]).reader;
    const view = render(<App {...common} savedPostings={saved} />);
    fireEvent.click(tab("내 정보"));
    await screen.findByText("copy@example.com");

    view.rerender(
      <App {...common} savedPostings={saved} autofillView={<p>진행 화면</p>} />,
    );
    view.rerender(<App {...common} savedPostings={saved} />);

    expect(tab("자동 기입")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "자동 기입" })).toHaveFocus();
  });
});

describe("마감 공고 tab", () => {
  const rowFor = (company: string) =>
    screen.getByRole("link", { name: new RegExp(company) });
  const openPostingsTab = async () => {
    fireEvent.click(tab(/마감 공고/));
    await screen.findByRole("tabpanel");
  };

  it("lists saved postings nearest first and leaves out past and completed ones", async () => {
    renderApp({}, [
      posting("later", "2026-11-08T12:00:00"),
      posting("past", "2026-11-02T09:00:00"),
      posting("done", "2026-11-03T12:00:00", { status: "completed" }),
      posting("today", "2026-11-02T18:00:00"),
      posting("next", "2026-11-03T17:00:00"),
    ]);
    await openPostingsTab();
    await screen.findByText("예시 회사 today");

    expect(
      screen.getAllByRole("listitem").map((row) => row.textContent),
    ).toEqual([
      "D-0예시 회사 today프론트엔드, 11월 2일 18시",
      "D-1예시 회사 next프론트엔드, 11월 3일 17시",
      "D-6예시 회사 later프론트엔드, 11월 8일 12시",
    ]);
  });

  it("omits an absent role from the second line", async () => {
    renderApp({}, [posting("norole", "2026-11-03T17:00:00", { role: "" })]);
    await openPostingsTab();

    expect(await screen.findByText("11월 3일 17시")).toBeVisible();
  });

  it("opens the whole row in a new tab without leaking the opener", async () => {
    renderApp({}, [posting("a", "2026-11-03T17:00:00")]);
    await openPostingsTab();
    await screen.findByText("예시 회사 a");
    const row = rowFor("예시 회사 a");

    expect(row).toHaveAttribute("href", "https://example.test/a");
    expect(row).toHaveAttribute("target", "_blank");
    expect(row).toHaveAttribute("rel", "noopener noreferrer");
    expect(row).toHaveTextContent("D-1");
  });

  it("marks D-3 and closer in danger color and D-4 and later as muted", async () => {
    renderApp({}, [
      posting("today", "2026-11-02T18:00:00"),
      posting("three", "2026-11-05T23:59:00"),
      posting("four", "2026-11-06T00:00:00"),
    ]);
    await openPostingsTab();
    await screen.findByText("예시 회사 today");

    for (const [label, weight, color] of [
      ["D-0", "600", "var(--color-danger-text)"],
      ["D-3", "600", "var(--color-danger-text)"],
      ["D-4", "600", "var(--panel-secondary)"],
    ] as const) {
      const dDay = screen.getByText(label);
      expect(declared(dDay, "font-weight")).toBe(weight);
      expect(declared(dDay, "color")).toBe(color);
      expect(declared(dDay, "font-size")).toBe("17px");
    }
  });

  it("has no save button, sub-tabs or filter line", async () => {
    renderApp({}, [posting("a", "2026-11-03T17:00:00")]);
    await openPostingsTab();
    await screen.findByText("예시 회사 a");

    expect(screen.queryByRole("button", { name: /저장/ })).toBeNull();
    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    expect(screen.queryByText(/지원 예정|마감 지남|지원 완료/)).toBeNull();
  });

  it("opens posting management from the footer with the unread badge beside it", async () => {
    const openPostings = vi.fn(async () => undefined);
    renderApp({
      openPostings,
      unreadPostings: { count: async () => 3, subscribe: () => () => {} },
    });
    await openPostingsTab();

    const manage = await screen.findByRole("button", {
      name: "공고 관리 새 공고 3건",
    });
    fireEvent.click(manage);
    expect(openPostings).toHaveBeenCalledWith(false);
  });

  it("keeps the failure alert when posting management cannot open", async () => {
    renderApp({
      openPostings: async () => {
        throw new Error("unavailable");
      },
    });
    await openPostingsTab();
    fireEvent.click(await screen.findByRole("button", { name: /공고 관리/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "공고 관리 화면을 열지 못했습니다",
    );
  });

  it("shows the empty state with the same footer", async () => {
    renderApp({}, [
      posting("past", "2026-11-01T09:00:00"),
      posting("done", "2026-11-03T12:00:00", { status: "completed" }),
    ]);
    await openPostingsTab();

    expect(await screen.findByText("저장한 공고 없음")).toBeVisible();
    expect(screen.getByRole("button", { name: /공고 관리/ })).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("explains a load failure and recovers through retry", async () => {
    const storage = storedPostings([posting("a", "2026-11-03T17:00:00")]);
    storage.fail(true);
    render(
      <App
        repository={repository()}
        track={vi.fn()}
        savedPostings={storage.reader}
        now={() => NOW}
      />,
    );
    await openPostingsTab();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "공고를 불러오지 못했습니다",
    );
    expect(screen.getByRole("button", { name: /공고 관리/ })).toBeVisible();

    storage.fail(false);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText("예시 회사 a")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("follows storage changes while open", async () => {
    const { storage } = renderApp({}, [posting("a", "2026-11-03T17:00:00")]);
    await openPostingsTab();
    await screen.findByText("예시 회사 a");

    await act(async () =>
      storage.change([posting("b", "2026-11-04T17:00:00")]),
    );

    expect(await screen.findByText("예시 회사 b")).toBeVisible();
    expect(screen.queryByText("예시 회사 a")).toBeNull();
  });
});

describe("마감 공고 count badge", () => {
  it("counts saved postings at D-3 or closer next to the label, on every tab", async () => {
    renderApp({}, [
      posting("today", "2026-11-02T18:00:00"),
      posting("three", "2026-11-05T23:59:00"),
      posting("four", "2026-11-06T00:00:00"),
      posting("past", "2026-11-02T09:00:00"),
      posting("done", "2026-11-03T12:00:00", { status: "completed" }),
    ]);

    const badge = await screen.findByLabelText("마감 임박 2건");
    expect(badge).toHaveTextContent("2");
    expect(tab(/마감 공고/)).toContainElement(badge);
    expect(tab(/마감 공고/)).toHaveAccessibleName("마감 공고 마감 임박 2건");
    expect(tab("자동 기입")).toHaveAttribute("aria-selected", "true");
  });

  it("is hidden when nothing is at D-3 or closer", async () => {
    renderApp({}, [posting("four", "2026-11-06T00:00:00")]);
    fireEvent.click(tab(/마감 공고/));
    await screen.findByText("예시 회사 four");

    expect(tab(/마감 공고/)).toHaveAccessibleName("마감 공고");
    expect(screen.queryByLabelText(/마감 임박/)).toBeNull();
  });

  it("is hidden after a load failure", async () => {
    const storage = storedPostings([]);
    storage.fail(true);
    render(
      <App
        repository={repository()}
        track={vi.fn()}
        savedPostings={storage.reader}
        now={() => NOW}
      />,
    );
    fireEvent.click(tab(/마감 공고/));
    await screen.findByRole("alert");

    expect(tab(/마감 공고/)).toHaveAccessibleName("마감 공고");
  });
});

describe("내 정보 tab", () => {
  it("lists all six profile groups", async () => {
    renderApp();
    fireEvent.click(tab("내 정보"));
    await screen.findByText("copy@example.com");

    for (const name of [
      "기본 인적사항 접기",
      "연락처와 주소 접기",
      "학력 0건 펼치기",
      "직장경력, 논문·특허, 처우 펼치기",
      "어학, 자격증, 프로젝트 0건 펼치기",
      "병역, 보훈, 장애와 건강 펼치기",
    ])
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
  });

  it("keeps the search text and open groups across tab switches", async () => {
    renderApp();
    fireEvent.click(tab("내 정보"));
    await screen.findByText("copy@example.com");
    fireEvent.click(screen.getByRole("button", { name: "학력 0건 펼치기" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "프로필 검색" }), {
      target: { value: "이메일" },
    });

    fireEvent.click(tab("자동 기입"));
    fireEvent.click(tab("내 정보"));

    expect(screen.getByRole("searchbox", { name: "프로필 검색" })).toHaveValue(
      "이메일",
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "프로필 검색" }), {
      target: { value: "" },
    });
    expect(screen.getByRole("button", { name: "학력 0건 접기" })).toBeVisible();
  });
});

describe("panel height", () => {
  it("fits content only on the tabs and only when asked", async () => {
    const common = { repository: repository(), track: vi.fn() };
    const saved = storedPostings([]).reader;
    const fitted = () => document.querySelector("[data-panel-fit]");
    const view = render(<App {...common} savedPostings={saved} fitContent />);
    await screen.findByRole("tablist");
    expect(fitted()).not.toBeNull();

    view.rerender(
      <App
        {...common}
        savedPostings={saved}
        fitContent
        autofillView={<p>진행 화면</p>}
      />,
    );
    expect(fitted()).toBeNull();

    view.rerender(<App {...common} savedPostings={saved} />);
    expect(fitted()).toBeNull();
  });
});

it("keeps the import result visible and shows the imported values on 내 정보", async () => {
  let profile = createEmptyProfile();
  renderApp({
    repository: {
      ...repository(),
      load: async () => structuredClone(profile),
      save: async (next) => {
        profile = structuredClone(next);
      },
    },
    readImportCandidates: async () => [
      {
        source: "basicInformation.email",
        profileFieldKey: "contact.contact.email",
        status: "available" as const,
        reason: "direct",
        value: "imported@example.test",
      },
    ],
  });
  fireEvent.click(settings());
  fireEvent.click(screen.getByRole("button", { name: "프로필 가져오기" }));
  await screen.findByText("프로필에 가져올 정보");
  fireEvent.click(screen.getByRole("button", { name: /프로필에 저장하기/ }));

  const notice = await screen.findByRole("status", { name: "가져오기 결과" });
  expect(notice).toHaveTextContent(/프로필에 \d+개를 저장했어요/);
  expect(tab("내 정보")).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("imported@example.test")).toBeVisible();

  fireEvent.click(tab("자동 기입"));
  expect(screen.getByRole("status", { name: "가져오기 결과" })).toBeVisible();
});
