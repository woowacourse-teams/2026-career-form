import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Trial } from "./Trial";

const openers = ["profile", "postings"] as const;
const closers = {
  button: () =>
    fireEvent.click(screen.getByRole("button", { name: "체험으로 돌아가기" })),
  escape: () => fireEvent.keyDown(document, { key: "Escape" }),
} as const;

async function renderTrial() {
  await act(async () => {
    render(
      <Trial
        track={vi.fn()}
        surface="site"
        install={<a href="https://example.test/store">Chrome에 추가</a>}
      />,
    );
  });
  return screen.getByRole("complementary", { name: "커리어폼 패널" });
}
// Each guide returns focus to what stays on screen: the settings button or the footer link.
async function open(guide: (typeof openers)[number]) {
  if (guide === "postings")
    fireEvent.click(screen.getByRole("tab", { name: /마감 공고/ }));
  const opener = screen.getByRole("button", {
    name: guide === "profile" ? "설정" : /공고 관리/,
  });
  opener.focus();
  fireEvent.click(opener);
  if (guide === "profile")
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "프로필 관리" }));
    });
  return opener;
}

describe("trial guide", () => {
  it.each(openers)(
    "%s guide makes only the covered panel inert",
    async (guide) => {
      const panel = await renderTrial();
      const opener = await open(guide);
      const dialog = screen.getByRole("dialog");
      expect(dialog).not.toHaveAttribute("aria-modal");
      expect(dialog.closest("[inert]")).toBeNull();
      expect(opener.closest("[inert]")).not.toBeNull();
      const covered = panel.querySelectorAll(
        "[data-demo-panel] :is(button, a[href], input, select, textarea, [tabindex])",
      );
      expect(covered.length).toBeGreaterThan(0);
      for (const control of covered)
        expect(control.closest("[inert]")).not.toBeNull();
      expect(
        screen.getByRole("heading", { name: "지원서 작성" }).closest("[inert]"),
      ).toBeNull();
      const fields = screen
        .getAllByRole("textbox")
        .filter((field) => !panel.contains(field));
      expect(fields.length).toBeGreaterThan(0);
      for (const field of fields) {
        expect(field.closest("[inert]")).toBeNull();
        expect(field).toBeEnabled();
      }
      expect(
        screen.getByRole("heading", { name: /설치 후에 열려요/ }),
      ).toHaveFocus();
    },
  );

  describe.each(["button", "escape"] as const)("closing by %s", (how) => {
    it.each(openers)(
      "%s guide returns focus to its opener after inert is removed",
      async (guide) => {
        await renderTrial();
        const opener = await open(guide);
        const inertWhenFocused: boolean[] = [];
        opener.addEventListener("focus", () =>
          inertWhenFocused.push(opener.closest("[inert]") !== null),
        );
        closers[how]();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(opener).toHaveFocus();
        expect(inertWhenFocused).toEqual([false]);
      },
    );
  });

  it("falls back to the panel title when the opener disappeared", async () => {
    const panel = await renderTrial();
    const opener = await open("profile");
    opener.remove();
    closers.escape();
    const title = panel.querySelector("h1");
    expect(title).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(title).toHaveFocus();
  });
});
