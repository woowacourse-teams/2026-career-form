import { createRoot, type Root } from "react-dom/client";
import { within } from "@testing-library/dom";
import { afterEach, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { greetingImportFixture } from "../../research/greeting-import-probe.test-fixtures";
import { createEmptyProfile, type Profile } from "../model";
import type { ProfileRepository } from "../profile-repository";
import { PageImport } from "./PageImport";
import { readGreetingImport } from "./reader";

const mounts: { root: Root; fixture: HTMLElement; host: HTMLElement }[] = [];

afterEach(() => {
  for (const { root, fixture, host } of mounts.splice(0)) {
    root.unmount();
    host.remove();
    fixture.remove();
  }
});

async function mountImport() {
  const fixture = document.createElement("div");
  fixture.innerHTML = greetingImportFixture();
  document.body.append(fixture);
  const email = fixture.querySelector<HTMLInputElement>(
    '[name="basicInformation.email"]',
  )!;
  email.value = "live-browser@example.invalid";
  const originalMarkup = fixture.innerHTML;
  let sourceEvents = 0;
  for (const event of ["input", "change", "click", "submit"]) {
    fixture.addEventListener(event, () => sourceEvents++);
  }
  let stored = createEmptyProfile();
  stored.contact = {
    email: "previous@example.invalid",
    addressLine1: "보존 주소",
  };
  const baseline = structuredClone(stored);
  let saves = 0;
  let saved: Profile | undefined;
  let closed = false;
  const repository: ProfileRepository = {
    load: async () => structuredClone(stored),
    save: async (profile) => {
      stored = structuredClone(profile);
      saves++;
    },
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
  const host = document.createElement("career-form-profile-panel");
  const shadow = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  shadow.append(container);
  document.body.append(host);
  const root = createRoot(container);
  mounts.push({ root, fixture, host });
  root.render(
    <PageImport
      repository={repository}
      readCandidates={async () => readGreetingImport(document)}
      onSaved={(profile) => {
        saved = profile;
      }}
      onClose={() => {
        closed = true;
      }}
    />,
  );
  const ui = within(container);
  await expect
    .poll(() => ui.queryByRole("checkbox", { name: "이메일 가져오기" }))
    .not.toBeNull();
  return {
    ui,
    baseline,
    stored: () => stored,
    saved: () => saved,
    saves: () => saves,
    closed: () => closed,
    expectSourceUnchanged: () => {
      expect(fixture.innerHTML).toBe(originalMarkup);
      expect(email.value).toBe("live-browser@example.invalid");
      expect(sourceEvents).toBe(0);
    },
  };
}

it("reads live Greeting values into a shadow review and saves only selected fields without inventing a date", async () => {
  const state = await mountImport();
  for (const input of state.ui.getAllByRole("checkbox"))
    expect((input as HTMLInputElement).checked).toBe(false);
  expect(
    (state.ui.getByLabelText("대학교 1 입학일 확인") as HTMLInputElement).value,
  ).toBe("");
  await userEvent.click(
    state.ui.getByRole("checkbox", { name: "이메일 가져오기" }),
  );
  await userEvent.click(
    state.ui.getByRole("checkbox", { name: "대학교 1 학교명 가져오기" }),
  );
  const select = state.ui.getByLabelText(
    "대학교 1 저장 대상",
  ) as HTMLSelectElement;
  // Dispatch a native selection change inside the isolated panel.
  select.value = "new";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await userEvent.click(
    state.ui.getByRole("button", { name: "선택한 정보 저장" }),
  );
  await expect.poll(() => state.saved()).toBeDefined();
  expect(state.saves()).toBe(1);
  expect(state.stored().contact).toEqual({
    email: "live-browser@example.invalid",
    addressLine1: "보존 주소",
  });
  expect(state.stored().personal).toEqual({});
  expect(state.stored().education).toEqual([
    {
      id: expect.any(String),
      sectionId: "university",
      values: { schoolName: "합성대학교A" },
      identity: { status: "manual", originalText: "합성대학교A" },
    },
  ]);
  expect(state.saved()).toEqual(state.stored());
  state.expectSourceUnchanged();
});

it("cancels an actual Greeting review without profile writes or source-page events", async () => {
  const state = await mountImport();
  await userEvent.click(
    state.ui.getByRole("checkbox", { name: "이메일 가져오기" }),
  );
  await userEvent.click(
    state.ui.getByRole("button", { name: "가져오기 취소" }),
  );
  await expect.poll(() => state.closed()).toBe(true);
  expect(state.saves()).toBe(0);
  expect(state.saved()).toBeUndefined();
  expect(state.stored()).toEqual(state.baseline);
  state.expectSourceUnchanged();
});
