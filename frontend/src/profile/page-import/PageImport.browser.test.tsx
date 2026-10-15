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

async function mountImport(
  extra = "",
  prepare?: (fixture: HTMLElement) => void,
  viewport?: { width: string; height: string; overflowY: string },
) {
  const fixture = document.createElement("div");
  fixture.innerHTML = greetingImportFixture().replace(
    "</form>",
    extra + "</form>",
  );
  prepare?.(fixture);
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
  if (viewport) Object.assign(container.style, viewport);
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
    .poll(() => ui.queryByText("프로필에 가져올 정보"))
    .not.toBeNull();
  return {
    ui,
    container,
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

type Mounted = Awaited<ReturnType<typeof mountImport>>;
const highlights = () =>
  document.querySelectorAll("[data-career-form-import-highlight]");
const button = (state: Mounted, name: string | RegExp) =>
  state.ui.getByRole("button", { name });
async function save(state: Mounted) {
  await userEvent.click(button(state, /프로필에 저장하기/));
  await expect.poll(() => state.saved()).toBeDefined();
  await expect.poll(() => highlights()).toHaveLength(0);
}
const bySchool = (profile: Profile) =>
  [...profile.education].sort((a, b) =>
    a.values.schoolName.localeCompare(b.values.schoolName),
  );

it("reviews the page on one screen and saves new values without inventing dates", async () => {
  const state = await mountImport();
  await userEvent.click(button(state, "아니에요"));
  const divider = state.ui.getByRole("slider", {
    name: "국문 성과 이름 구분선",
  });
  const dividerStyle = getComputedStyle(divider);
  expect(dividerStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  for (const edge of ["Top", "Right", "Bottom", "Left"] as const) {
    expect(dividerStyle[`border${edge}Width`]).toBe("0px");
    expect(dividerStyle[`padding${edge}`]).toBe("0px");
  }
  await userEvent.click(button(state, /연락처와 주소/));
  await userEvent.click(
    state.ui.getByRole("checkbox", { name: "이메일 가져오기" }),
  );
  await save(state);
  expect(state.saves()).toBe(1);
  expect(state.stored().contact).toEqual({
    email: "live-browser@example.invalid",
    phoneNumber: "01000000000",
    addressLine1: "보존 주소",
  });
  expect(state.stored().personal).toEqual({});
  expect(bySchool(state.stored())).toEqual([
    {
      id: expect.any(String),
      sectionId: "university",
      values: { schoolName: "합성대학교A" },
      identity: { status: "manual", originalText: "합성대학교A" },
    },
    {
      id: expect.any(String),
      sectionId: "university",
      values: { schoolName: "합성대학교B", startDate: "2022-03-02" },
      identity: { status: "manual", originalText: "합성대학교B" },
    },
  ]);
  expect(state.saved()).toEqual(state.stored());
  state.expectSourceUnchanged();
});

it("closes the review without profile writes or source-page events", async () => {
  const state = await mountImport();
  await userEvent.click(button(state, /연락처와 주소/));
  await userEvent.click(
    state.ui.getByRole("checkbox", { name: "이메일 가져오기" }),
  );
  await userEvent.click(button(state, "닫기"));
  await expect.poll(() => state.closed()).toBe(true);
  expect(state.saves()).toBe(0);
  expect(state.saved()).toBeUndefined();
  expect(state.stored()).toEqual(state.baseline);
  state.expectSourceUnchanged();
});

it("imports multiple section types around unknown and malformed fields in Chromium", async () => {
  const state = await mountImport(`
    <input name="basicInformation.gender" value="남성">
    <div data-scope="accordion" data-part="root">
      <div data-scope="accordion" data-part="item">
        <input name="workHistory.workExperiences.4.companyName" value="합성회사">
        <textarea name="workHistory.workExperiences.4.dutiesResponsibility">합성 업무</textarea>
        <input name="custom.companyQuestion" value="제외할 추가 질문">
        <button type="button" name="workHistory.workExperiences.4.employmentPeriod.startDate">날짜 오류</button>
      </div>
      <div data-scope="accordion" data-part="item">
        <input name="languagesCertificationsAndOtherActivity.certificatesLicenses.0.credentials" value="합성자격증">
        <input name="languagesCertificationsAndOtherActivity.certificatesLicenses.0.registrationNumber" value="SYNTHETIC-001">
      </div>
    </div>`);
  await userEvent.click(
    state.ui.getByRole("switch", { name: "학력 가져오기" }),
  );
  await userEvent.click(button(state, /직장경력/));
  expect(
    state.ui.queryByRole("checkbox", { name: "직장경력 5 입사일 가져오기" }),
  ).toBeNull();
  expect(state.ui.getByText("새 항목")).toBeDefined();
  await save(state);
  expect(state.stored().personal).toEqual({ gender: "남성" });
  expect(state.stored().careers[0].values).toEqual({
    companyName: "합성회사",
    responsibilities: "합성 업무",
  });
  expect(state.stored().certifications[0].values).toEqual({
    name: "합성자격증",
    registrationNo: "SYNTHETIC-001",
  });
  expect(state.stored().education).toEqual([]);
  state.expectSourceUnchanged();
});

it("skips blank default rows and unknown controls", async () => {
  const state = await mountImport(
    `
    <div data-scope="accordion" data-part="item">
      <input name="educationalBackground.graduateSchools.0.schoolName" value="">
      <button type="button" name="educationalBackground.graduateSchools.0.majors.0.majorClassification">주전공</button>
    </div>
    <div data-scope="accordion" data-part="item">
      <input name="workHistory.workExperiences.0.companyName" value="">
      <input type="checkbox" name="workHistory.workExperiences.0.employmentStatus">
    </div>
    <div data-scope="accordion" data-part="item">
      <input name="workHistory.workExperiences.4.companyName" value="합성회사">
      <input type="checkbox" name="workHistory.workExperiences.4.employmentStatus">
      <textarea name="workHistory.workExperiences.4.dutiesResponsibility">합성 업무</textarea>
    </div>
    <input name="custom.unknown" value="제외할 값">
  `,
    (fixture) => {
      fixture.querySelector<HTMLInputElement>(
        '[name="basicInformation.name"]',
      )!.value = "";
      fixture
        .querySelector('[data-scope="accordion"][data-part="root"]')!
        .remove();
    },
  );
  expect(state.ui.queryByRole("heading", { name: /이렇게 나누면/ })).toBeNull();
  await userEvent.click(button(state, /연락처와 주소/));
  await userEvent.click(
    state.ui.getByRole("checkbox", { name: "이메일 가져오기" }),
  );
  await save(state);
  expect(state.stored().contact).toEqual({
    email: "live-browser@example.invalid",
    phoneNumber: "01000000000",
    addressLine1: "보존 주소",
  });
  expect(state.stored().education).toEqual([]);
  expect(state.stored().careers).toEqual([
    {
      id: expect.any(String),
      sectionId: "career",
      values: {
        companyName: "합성회사",
        employmentStatus: "퇴사",
        responsibilities: "합성 업무",
      },
    },
  ]);
  expect(state.saves()).toBe(1);
  state.expectSourceUnchanged();
});

it.each([280, 332])(
  "keeps the save button reachable without sideways scrolling in a %ipx panel",
  async (width) => {
    const state = await mountImport("", undefined, {
      width: `${width}px`,
      height: "400px",
      overflowY: "auto",
    });
    const frame = state.container.getBoundingClientRect();
    const bounds = button(state, /프로필에 저장하기/).getBoundingClientRect();
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.left).toBeGreaterThanOrEqual(frame.left);
    expect(bounds.right).toBeLessThanOrEqual(frame.right + 1);
    expect(bounds.bottom).toBeLessThanOrEqual(frame.bottom + 1);
    expect(state.container.scrollWidth).toBeLessThanOrEqual(
      state.container.clientWidth,
    );
  },
);

it("shows the summary first when a constrained panel opens", async () => {
  const state = await mountImport("", undefined, {
    width: "332px",
    height: "300px",
    overflowY: "auto",
  });
  const frame = state.container.getBoundingClientRect();
  const summary = state.ui
    .getByText("프로필에 가져올 정보")
    .getBoundingClientRect();
  expect(summary.top).toBeGreaterThanOrEqual(frame.top);
  expect(summary.bottom).toBeLessThanOrEqual(frame.bottom);
});

it("keeps the day input whole inside a 280px date card", async () => {
  const state = await mountImport("", undefined, {
    width: "280px",
    height: "400px",
    overflowY: "auto",
  });
  await userEvent.click(button(state, "나중에 할게요"));
  const card = state.ui
    .getByRole("heading", { name: /며칠인가요/ })
    .closest("article")!
    .getBoundingClientRect();
  const input = state.ui.getByLabelText(/의 일$/).getBoundingClientRect();
  expect(input.width).toBeGreaterThanOrEqual(60);
  expect(input.left).toBeGreaterThanOrEqual(card.left);
  expect(input.right).toBeLessThanOrEqual(card.right);
});

it("highlights the original field of the focused value and clears it on close", async () => {
  const state = await mountImport();
  await userEvent.click(button(state, /연락처와 주소/));
  state.ui.getByRole("checkbox", { name: "전화번호 가져오기" }).focus();
  await expect.poll(() => highlights()).toHaveLength(1);
  const phone = document.querySelector<HTMLElement>(
    '[name="basicInformation.phoneNumber.nationalNumber"]',
  )!;
  await expect
    .poll(() => {
      const box = highlights()[0].getBoundingClientRect();
      const field = phone.getBoundingClientRect();
      return (
        box.left <= field.left + 1 &&
        box.right >= field.right - 1 &&
        box.top <= field.top + 1 &&
        box.bottom >= field.bottom - 1
      );
    })
    .toBe(true);
  state.ui.getByRole("checkbox", { name: "이메일 가져오기" }).focus();
  await expect.poll(() => highlights()).toHaveLength(1);
  await userEvent.click(button(state, "닫기"));
  await expect.poll(() => highlights()).toHaveLength(0);
  state.expectSourceUnchanged();
});

it("fits every expanded category and card in a 280px panel without middle dots", async () => {
  const state = await mountImport(
    `<div data-scope="accordion" data-part="item">
      <input name="languagesCertificationsAndOtherActivity.certificatesLicenses.0.credentials" value="합성자격증">
    </div>`,
    undefined,
    { width: "280px", height: "500px", overflowY: "auto" },
  );
  await userEvent.click(button(state, "아니에요"));
  for (const toggle of state.ui
    .getAllByRole("button", { expanded: false })
    .filter((element) => element.hasAttribute("aria-expanded")))
    await userEvent.click(toggle);
  expect(state.container.scrollWidth).toBeLessThanOrEqual(
    state.container.clientWidth,
  );
  expect(state.container.textContent).not.toContain("·");
  const card = state.ui
    .getByRole("heading", { name: "성과 이름을 나눠 주세요" })
    .closest("article")!;
  const cardBox = card.getBoundingClientRect();
  for (const control of within(card).getAllByRole("button")) {
    const box = control.getBoundingClientRect();
    expect(box.height).toBeGreaterThanOrEqual(36);
    expect(box.left).toBeGreaterThanOrEqual(cardBox.left);
    expect(box.right).toBeLessThanOrEqual(cardBox.right + 1);
    expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth + 1);
  }
  for (const row of state.container.querySelectorAll<HTMLElement>(
    "[data-status]",
  )) {
    const box = row.getBoundingClientRect();
    expect(box.right).toBeLessThanOrEqual(
      state.container.getBoundingClientRect().right + 1,
    );
  }
});
