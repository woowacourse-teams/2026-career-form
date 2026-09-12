import { waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import {
  control,
  fixtureProfile,
  hidden,
  renderApplication,
  run,
  service,
} from "./workflow-military-veteran.integration.test-fixtures";

afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

it("selects both Hyundai drivers, fills corresponding detail display/code/months, and reruns without selection events", async () => {
  const clicks = renderApplication();
  const first = await run(fixtureProfile());
  await waitFor(
    () =>
      expect(
        first.getByRole("heading", { name: "기입 결과" }),
      ).toBeInTheDocument(),
    { timeout: 5000 },
  );
  expect(first.queryByRole("button", { name: /값 보기|포함하기/ })).toBeNull();
  expect([control("milCd").value, hidden("milCd")]).toEqual(["필", "1"]);
  expect([control("milDitinc").value, hidden("milDitinc")]).toEqual([
    "육군",
    "1",
  ]);
  expect([control("milRank").value, hidden("milRank")]).toEqual(["병장", "41"]);
  expect([control("milStartDt").value, control("milEndDt").value]).toEqual([
    "2020-03",
    "2021-09",
  ]);
  expect([control("branchYn").value, hidden("branchYn")]).toEqual(["예", "Y"]);
  expect([
    control("branchRel").value,
    hidden("branchRel"),
    control("branchNo").value,
  ]).toEqual(["대상(본인)", "1", "1234567890"]);
  expect(control("milExcptCd")).toBeDisabled();
  expect([
    control("branchSupplyYn").checked,
    hidden("branchAddPoint"),
    control("injuryMemo").value,
  ]).toEqual([false, "", "기존 장애 메모"]);
  expect(control("engNm").value).toBe("Fixture");
  expect(first.getByText("직접 확인 필요").parentElement).toHaveTextContent(
    "0직접 확인 필요",
  );
  const firstClicks = { ...clicks };
  first.unmount();
  const second = await run(fixtureProfile());
  await waitFor(
    () =>
      expect(
        second.getByRole("heading", { name: "기입 결과" }),
      ).toBeInTheDocument(),
    { timeout: 5000 },
  );
  expect(clicks).toEqual(firstClicks);
  expect(control("branchNo").value).toBe("1234567890");
});

it("automatically writes Hyundai drivers and details without sensitive-value confirmation", async () => {
  renderApplication();
  const result = run(fixtureProfile());

  await waitFor(() =>
    expect(
      result.getByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument(),
  );
  expect(result.queryByRole("button", { name: /값 보기|포함하기/ })).toBeNull();
  expect([
    hidden("milCd"),
    hidden("branchYn"),
    control("milStartDt").value,
    control("milEndDt").value,
    hidden("milRank"),
    hidden("milDitinc"),
    control("branchNo").value,
  ]).toEqual(["1", "Y", "2020-03", "2021-09", "41", "1", "1234567890"]);
});

it("automatically writes Hyundai disability status, grade, and type without sensitive-value confirmation", async () => {
  const clicks = renderApplication();
  const profile = fixtureProfile();
  profile.disability = {
    disabilityStatus: "대상",
    disabilityGrade: "중증",
    disabilityType: "지체장애",
  };
  const first = run(profile);

  await waitFor(() =>
    expect(
      first.getByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument(),
  );
  expect(first.queryByRole("button", { name: /값 보기|포함하기/ })).toBeNull();
  expect([
    control("injuryYn").value,
    hidden("injuryYn"),
    control("injuryGrade").value,
    hidden("injuryGrade"),
    control("injuryType").value,
    hidden("injuryType"),
  ]).toEqual(["예", "Y", "심한 장애인", "10", "지체장애", "10"]);
  const firstClicks = { ...clicks };

  first.unmount();
  const second = run(profile);
  await waitFor(() =>
    expect(
      second.getByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument(),
  );
  expect(clicks).toEqual(firstClicks);
});

it.each(["", "disability-status:unverified", "veteran-status:eligible"])(
  "leaves an unsupported disability option unchanged for %s",
  async (disabilityStatus) => {
    renderApplication();
    const profile = fixtureProfile();
    profile.disability = {
      disabilityStatus,
      disabilityGrade: "중증",
      disabilityType: "지체장애",
    };

    const result = await run(profile);
    await waitFor(() =>
      expect(
        result.getByRole("heading", { name: "기입 결과" }),
      ).toBeInTheDocument(),
    );
    expect([
      hidden("injuryYn"),
      hidden("injuryGrade"),
      hidden("injuryType"),
    ]).toEqual(["", "", ""]);
    expect(control("engNm").value).toBe("Fixture");
  },
);

it("treats the legacy 만기전역 profile value as 군필 only during Hyundai autofill", async () => {
  renderApplication();
  const profile = fixtureProfile();
  profile.military.militaryStatus = "만기전역";
  const result = await run(profile);
  await waitFor(() =>
    expect(
      result.getByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument(),
  );
  expect([control("milCd").value, hidden("milCd")]).toEqual(["필", "1"]);
  expect([control("milRank").value, hidden("milRank")]).toEqual(["병장", "41"]);
  expect([control("milDitinc").value, hidden("milDitinc")]).toEqual([
    "육군",
    "1",
  ]);
  expect([control("milStartDt").value, control("milEndDt").value]).toEqual([
    "2020-03",
    "2021-09",
  ]);
  expect(result.getByText("직접 확인 필요").parentElement).toHaveTextContent(
    "0직접 확인 필요",
  );
});

it.each([
  {
    name: "canonical standard IDs",
    militaryStatus: "military-status:served",
    militaryBranch: "military-branch:army",
    militaryRank: "military-rank:byeongjang",
    veteranStatus: "veteran-status:eligible",
  },
  {
    name: "legacy aliases",
    militaryStatus: "만기전역",
    militaryBranch: "육군",
    militaryRank: "병장",
    veteranStatus: "yes",
  },
])(
  "writes Hyundai exact military and veteran controls from $name and reruns without new selections",
  async (scenario) => {
    const clicks = renderApplication();
    const profile = fixtureProfile();
    profile.military.militaryStatus = scenario.militaryStatus;
    profile.military.militaryBranch = scenario.militaryBranch;
    profile.military.militaryRank = scenario.militaryRank;
    profile.veteran.veteranStatus = scenario.veteranStatus;

    const first = await run(profile);
    await waitFor(() =>
      expect(
        first.getByRole("heading", { name: "기입 결과" }),
      ).toBeInTheDocument(),
    );
    expect([control("milCd").value, hidden("milCd")]).toEqual(["필", "1"]);
    expect([control("milDitinc").value, hidden("milDitinc")]).toEqual([
      "육군",
      "1",
    ]);
    expect([control("milRank").value, hidden("milRank")]).toEqual([
      "병장",
      "41",
    ]);
    expect([control("branchYn").value, hidden("branchYn")]).toEqual([
      "예",
      "Y",
    ]);
    const firstClicks = { ...clicks };

    first.unmount();
    const second = await run(profile);
    await waitFor(() =>
      expect(
        second.getByRole("heading", { name: "기입 결과" }),
      ).toBeInTheDocument(),
    );
    expect(clicks).toEqual(firstClicks);
  },
);

it.each([
  ["empty", "", ""],
  ["unknown", "military-status:unverified", "veteran-status:unverified"],
  ["cross-field IDs", "veteran-status:eligible", "military-status:served"],
])(
  "does not change opposite Hyundai drivers for $0 option values",
  async (_name, militaryStatus, veteranStatus) => {
    const clicks = renderApplication();
    document
      .querySelector<HTMLButtonElement>(
        "#milCd ~ .select-option button[data-code='2']",
      )!
      .click();
    document
      .querySelector<HTMLButtonElement>(
        "#branchYn ~ .select-option button[data-code='N']",
      )!
      .click();
    const before = { ...clicks };
    const profile = fixtureProfile();
    profile.military.militaryStatus = militaryStatus;
    profile.veteran.veteranStatus = veteranStatus;

    const result = await run(profile);
    await waitFor(() =>
      expect(
        result.getByRole("heading", { name: "기입 결과" }),
      ).toBeInTheDocument(),
    );
    expect([
      control("milCd").value,
      hidden("milCd"),
      control("branchYn").value,
      hidden("branchYn"),
    ]).toEqual(["미필", "2", "아니오", "N"]);
    expect(clicks).toEqual(before);
    expect([control("milStartDt").value, control("branchNo").value]).toEqual([
      "",
      "",
    ]);
    expect(control("engNm").value).toBe("Fixture");
  },
);

it("preserves opposite existing selections while continuing an unrelated field", async () => {
  const clicks = renderApplication();
  document
    .querySelector<HTMLButtonElement>(
      "#milCd ~ .select-option button[data-code='2']",
    )!
    .click();
  document
    .querySelector<HTMLButtonElement>(
      "#branchYn ~ .select-option button[data-code='N']",
    )!
    .click();
  const before = { ...clicks };
  const result = await run(fixtureProfile());
  await waitFor(() =>
    expect(
      result.getByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument(),
  );
  expect([
    control("milCd").value,
    hidden("milCd"),
    control("branchYn").value,
    hidden("branchYn"),
  ]).toEqual(["미필", "2", "아니오", "N"]);
  expect(clicks).toEqual(before);
  expect([control("milStartDt").value, control("branchNo").value]).toEqual([
    "",
    "",
  ]);
  expect(control("engNm").value).toBe("Fixture");
});

it.each([
  {
    id: "milCd",
    code: "2",
    dependent: "milStartDt",
    independent: "branchNo",
    expected: "1234567890",
  },
  {
    id: "branchYn",
    code: "N",
    dependent: "branchNo",
    independent: "milStartDt",
    expected: "2020-03",
  },
])(
  "preserves existing $id while completing the other conditional group",
  async ({ id, code, dependent, independent, expected }) => {
    const clicks = renderApplication();
    document
      .querySelector<HTMLButtonElement>(
        `#${id} ~ .select-option button[data-code='${code}']`,
      )!
      .click();
    const before = clicks[id];
    const result = await run(fixtureProfile());
    await waitFor(() =>
      expect(
        result.getByRole("heading", { name: "기입 결과" }),
      ).toBeInTheDocument(),
    );
    expect(hidden(id)).toBe(code);
    expect(clicks[id]).toBe(before);
    expect(control(dependent).value).toBe("");
    expect(control(independent).value).toBe(expected);
    expect(control("engNm").value).toBe("Fixture");
  },
);
it("does not write military details after a partial driver transition and still fills veteran and unrelated fields", async () => {
  renderApplication({ failMilitaryTransition: true });
  const result = await run(fixtureProfile());
  await waitFor(
    () =>
      expect(
        result.getByRole("heading", { name: "기입 결과" }),
      ).toBeInTheDocument(),
    { timeout: 5000 },
  );
  expect([
    control("milStartDt").value,
    control("milEndDt").value,
    hidden("milRank"),
    hidden("milDitinc"),
  ]).toEqual(["", "", "", ""]);
  expect(control("branchNo").value).toBe("1234567890");
  expect(control("engNm").value).toBe("Fixture");
  // The intentional 3-second driver timeout precedes further explicit review rounds.
}, 10_000);

it("leaves enabled military details blank when the profile has no supported status", async () => {
  renderApplication();
  const profile = fixtureProfile();
  profile.military.militaryStatus = "복무중";
  const result = await run(profile);
  await waitFor(() =>
    expect(
      result.getByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument(),
  );
  expect([
    hidden("milCd"),
    control("milStartDt").value,
    control("milEndDt").value,
    hidden("milRank"),
    hidden("milDitinc"),
  ]).toEqual(["", "", "", "", ""]);
  expect(control("branchNo").value).toBe("1234567890");
  expect(control("engNm").value).toBe("Fixture");
});

it("leaves an incompatible veteran number blank while completing other fields", async () => {
  renderApplication();
  const profile = fixtureProfile();
  profile.veteran.veteranNumber = "VET-DEMO-001";
  const result = await run(profile);
  await waitFor(() =>
    expect(
      result.getByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument(),
  );
  expect(control("branchNo").value).toBe("");
  expect(result.getByText("직접 확인 필요").parentElement).toHaveTextContent(
    "1직접 확인 필요",
  );
  expect(hidden("branchRel")).toBe("1");
  expect(control("milStartDt").value).toBe("2020-03");
  expect(control("engNm").value).toBe("Fixture");
});

it("does not resume detail writes after the workflow is closed during a pending transition", async () => {
  renderApplication({ failMilitaryTransition: true });
  const result = run(fixtureProfile());
  await waitFor(() => expect(hidden("milCd")).toBe("1"));
  result.unmount();
  await new Promise((resolve) => setTimeout(resolve, 3100));
  expect([
    control("milStartDt").value,
    control("milEndDt").value,
    hidden("milRank"),
    hidden("milDitinc"),
    control("branchNo").value,
    control("engNm").value,
  ]).toEqual(["", "", "", "", "", ""]);
});

it.each([
  {
    status: "military-status:not-served",
    display: "미필",
    code: "2",
    veteranStatus: "veteran-status:not-eligible",
    veteranDisplay: "아니오",
    veteranCode: "N",
    exemption: "",
  },
  {
    status: "military-status:exempt",
    display: "면제",
    code: "5",
    veteranStatus: "veteran-status:eligible",
    veteranDisplay: "예",
    veteranCode: "Y",
    exemption: "01",
  },
  {
    status: "military-status:not-applicable",
    display: "비대상(여성/해외국적)",
    code: "7",
    veteranStatus: "veteran-status:not-eligible",
    veteranDisplay: "아니오",
    veteranCode: "N",
    exemption: "",
  },
])(
  "applies the $status state without forcing service details",
  async (scenario) => {
    renderApplication();
    const profile = fixtureProfile();
    profile.military = {
      militaryStatus: scenario.status,
      ...(scenario.status === "military-status:exempt"
        ? { exemptionReason: "신체문제" }
        : {}),
    };
    profile.veteran =
      scenario.veteranStatus === "veteran-status:eligible"
        ? { ...profile.veteran, veteranStatus: scenario.veteranStatus }
        : { veteranStatus: scenario.veteranStatus };
    const result = await run(profile);
    await waitFor(() =>
      expect(
        result.getByRole("heading", { name: "기입 결과" }),
      ).toBeInTheDocument(),
    );
    expect([
      control("milCd").value,
      hidden("milCd"),
      hidden("milExcptCd"),
    ]).toEqual([scenario.display, scenario.code, scenario.exemption]);
    expect([control("branchYn").value, hidden("branchYn")]).toEqual([
      scenario.veteranDisplay,
      scenario.veteranCode,
    ]);
    for (const id of ["milStartDt", "milEndDt", "milRank", "milDitinc"]) {
      expect(control(id)).toBeDisabled();
      expect(control(id).value).toBe("");
    }
    expect(control("branchNo").value).toBe(
      scenario.veteranStatus === "veteran-status:eligible" ? "1234567890" : "",
    );
    expect(control("engNm").value).toBe("Fixture");
  },
);
