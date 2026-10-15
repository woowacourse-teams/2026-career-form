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
    .poll(() => ui.queryByRole("button", { name: "다음" }))
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

async function goTo(
  state: Awaited<ReturnType<typeof mountImport>>,
  title: string,
) {
  for (let count = 0; count < 20; count++) {
    if (state.ui.queryByRole("heading", { name: title })) return;
    const revisit = state.ui.queryByRole("button", {
      name: `${title} 다시 확인`,
    });
    if (revisit) {
      await userEvent.click(revisit);
      return;
    }
    await userEvent.click(
      state.ui.getByRole("button", { name: "이 단계 건너뛰기" }),
    );
  }
  throw new Error(`Review step not found: ${title}`);
}
const next = async (state: Awaited<ReturnType<typeof mountImport>>) => {
  await userEvent.click(state.ui.getByRole("button", { name: "다음" }));
};
const take = async (state: Awaited<ReturnType<typeof mountImport>>) => {
  await userEvent.click(
    state.ui.getByRole("button", { name: "이 단계 가져오기" }),
  );
};
async function finish(state: Awaited<ReturnType<typeof mountImport>>) {
  await goTo(state, "저장 전 확인");
  await expect
    .poll(() =>
      document.querySelectorAll("[data-career-form-import-highlight]"),
    )
    .toHaveLength(0);
  await userEvent.click(
    state.ui.getByRole("button", { name: "선택한 정보 저장" }),
  );
  await expect.poll(() => state.saved()).toBeDefined();
}

it("reviews sources step by step and saves only selected fields without inventing a date", async () => {
  const state = await mountImport();
  expect(
    state.ui.queryByRole("checkbox", { name: "이메일 가져오기" }),
  ).toBeNull();
  const divider = state.ui.getByRole("slider", {
    name: "국문 성과 이름 구분선",
  });
  const dividerStyle = getComputedStyle(divider);
  expect(dividerStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  for (const edge of ["Top", "Right", "Bottom", "Left"] as const) {
    expect(dividerStyle[`border${edge}Width`]).toBe("0px");
    expect(dividerStyle[`padding${edge}`]).toBe("0px");
  }

  await expect
    .poll(() =>
      document.querySelectorAll("[data-career-form-import-highlight]"),
    )
    .toHaveLength(1);
  await goTo(state, "연락처와 주소");
  await expect
    .poll(() =>
      document.querySelectorAll("[data-career-form-import-highlight]"),
    )
    .toHaveLength(2);
  await userEvent.click(
    state.ui.getByRole("checkbox", { name: "이메일 가져오기" }),
  );
  await next(state);
  await goTo(state, "대학교 1");
  expect(
    (state.ui.getByLabelText("대학교 1 입학일 확인") as HTMLInputElement).value,
  ).toBe("");
  expect(
    state.ui.getByRole("checkbox", { name: "대학교 1 입학일 가져오기" }),
  ).toBeDisabled();
  expect(
    state.ui.getByRole("radio", { name: /^새 정보로 추가/ }),
  ).toBeChecked();
  await userEvent.click(
    state.ui.getByRole("checkbox", { name: "대학교 1 학교명 가져오기" }),
  );
  await next(state);
  await finish(state);
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

it("cancels a step review without profile writes or source-page events", async () => {
  const state = await mountImport();
  await goTo(state, "연락처와 주소");
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
  await goTo(state, "기본 인적사항");
  await take(state);
  await goTo(state, "자격증·면허증 1");
  await take(state);
  await goTo(state, "직장경력 5");
  expect(
    state.ui.queryByRole("checkbox", { name: "직장경력 5 입사일 가져오기" }),
  ).toBeNull();
  expect(
    state.ui.getByRole("radio", { name: /^새 정보로 추가/ }),
  ).toBeChecked();
  await take(state);
  await finish(state);
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

it("takes readable steps while skipping blank default rows and unknown controls", async () => {
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
  await take(state);
  expect(state.ui.getByRole("heading", { name: "직장경력 5" })).toBeDefined();
  await take(state);
  expect(state.ui.getByRole("heading", { name: "저장 전 확인" })).toBeDefined();
  await finish(state);
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

it("reveals the new step title after advancing from the bottom of a tall review", async () => {
  const state = await mountImport();
  Object.assign(state.container.style, { height: "300px", overflowY: "auto" });
  await goTo(state, "대학교 1");
  const nextButton = state.ui.getByRole("button", { name: "다음" });
  nextButton.scrollIntoView({ block: "end" });
  expect(state.container.scrollTop).toBeGreaterThan(100);
  await userEvent.click(nextButton);
  const title = state.ui.getByRole("heading", { name: "대학교 2" });
  await expect
    .poll(() => {
      const frame = state.container.getBoundingClientRect();
      const heading = title.getBoundingClientRect();
      // Chromium rounds scrollTop to whole pixels while layout uses subpixels.
      return (
        Math.round(heading.top - frame.top) >= 0 &&
        Math.round(heading.bottom - frame.bottom) <= 0
      );
    })
    .toBe(true);
});
