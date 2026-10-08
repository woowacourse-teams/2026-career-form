import { afterEach, expect, it, vi } from "vitest";
import {
  createEmptyProfile,
  type ProfileIdentity,
} from "../../../profile/model";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../../dom/candidate-registry";
import { buildReviewPlan } from "../../review/review-plan";
import { greetingWorkflowAdapter } from "./workflow";
import type { FieldCandidateHandle } from "../../dom/types";
import type { FieldsAnalyzeResponse } from "../../api/types";
import { matchesResultValue } from "../../workflow/result-value-match";

vi.mock("../../../profile/catalog", () => {
  const entries = [
    {
      id: "cert:sqld",
      kind: "certificate",
      name: "SQL 개발자",
      detail: "한국데이터산업진흥원",
      aliases: ["SQLD", "SQL 개발자(SQLD)", "shared"],
    },
    {
      id: "cert:sqlp",
      kind: "certificate",
      name: "SQL 전문가",
      detail: "한국데이터산업진흥원",
      aliases: ["SQLP", "shared"],
    },
    {
      id: "school:seoul",
      kind: "university",
      name: "예시대학교",
      detail: "서울 캠퍼스",
      aliases: ["예시대"],
    },
  ];
  return {
    CATALOG: entries,
    CATALOG_VERSION: "2026-10-07",
    getCatalogEntry: (id: string) => entries.find((entry) => entry.id === id),
  };
});
afterEach(() => document.body.replaceChildren());
const selected = (
  overrides: Partial<Extract<ProfileIdentity, { status: "selected" }>> = {},
): ProfileIdentity => ({
  status: "selected",
  catalogId: "cert:sqld",
  displayName: "SQL 개발자",
  originalText: "SQLD",
  catalogVersion: "2026-10-07",
  ...overrides,
});

async function run(
  identity: ProfileIdentity | undefined,
  options: {
    label: string;
    detail?: string;
    commitId?: string;
    hiddenDetail?: boolean;
  }[],
  school = false,
  value = school ? "예시대학교" : "SQL 개발자",
) {
  const profile = createEmptyProfile();
  const category = school ? "education" : "certifications";
  const section = school ? "university" : "certificate";
  const field = school ? "schoolName" : "name";
  profile[category].push({
    id: "entry",
    sectionId: section,
    values: {
      [field]: value,
      ...(school ? {} : { issuingOrganization: "원래기관" }),
    },
    ...(identity ? { identity } : {}),
  });
  const before = structuredClone(profile);
  const key = `${category}.${section}.${field}`;
  const name = school
    ? "educationalBackground.universities.0.schoolName"
    : "languagesCertificationsAndOtherActivity.certificatesLicenses.0.credentials";
  document.body.innerHTML = `<input name="${name}" data-scope="combobox" data-part="input" role="combobox" aria-controls="choices"><input id="unrelated" value="preserved"><div id="choices" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open">${options.map((option, i) => `<div role="option" data-scope="combobox" data-part="item" data-state="unchecked" data-value="site-${i}">${option.label}${option.detail ? `<span data-part="item-description" ${option.hiddenDetail ? "hidden" : ""}>${option.detail}</span>` : ""}</div>`).join("")}</div>`;
  const input = document.querySelector<HTMLInputElement>("input")!;
  const clicked = vi.fn();
  document
    .querySelectorAll<HTMLElement>('[role="option"]')
    .forEach((option, i) => {
      option.onclick = () => {
        clicked(i);
        input.value = options[i].label;
        option.setAttribute("data-state", "checked");
        if (options[i].commitId)
          option.setAttribute("data-value", options[i].commitId!);
        input.setAttribute("aria-expanded", "false");
      };
    });
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div data-scope="field" data-part="root"><label>이름</label><input name="basicInformation.name"></div><div data-scope="field" data-part="root"><label>전화</label><input name="basicInformation.phoneNumber.nationalNumber"></div>',
  );
  const handle = {
    kind: "field",
    candidateId: "f",
    sectionId: "section",
    itemIndex: 0,
    signature: createStructuralSignature([input]),
    candidate: { candidateId: "f", domName: name, control: "text" },
    elements: [input],
    optionElements: new Map(),
  } as unknown as FieldCandidateHandle;
  const registry = new CandidateRegistry();
  registry.registerField(handle);
  const analysis: FieldsAnalyzeResponse = {
    snapshotId: "snapshot",
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: [
      {
        candidateId: "f",
        matchType: "MATCH",
        valueBinding: { type: "DIRECT", profileFieldKey: key },
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        autofillPolicy: "ALLOWED",
        writePlan: { command: "SEARCH_SELECTION" },
      },
    ],
  };
  const item = buildReviewPlan({ analysis, registry, profile }).items[0];
  if (item.status === "unavailable") {
    expect(item.disabled).toBe(true);
    expect(item.selected).toBe(false);
    expect(profile).toEqual(before);
    expect(document.querySelector<HTMLInputElement>("#unrelated")!.value).toBe(
      "preserved",
    );
    return { success: false, clicked, input, item, handle };
  }
  expect(item.profileValue).toBe(value);
  expect(item.searchIdentity).toEqual(identity);
  const success = await greetingWorkflowAdapter.executeStateDriver!(
    document,
    handle,
    item,
    new AbortController().signal,
  );
  expect(profile).toEqual(before);
  expect(document.querySelector<HTMLInputElement>("#unrelated")!.value).toBe(
    "preserved",
  );
  return { success, clicked, input, item, handle };
}
it("does not reuse a Greeting receipt after the chosen label is edited to another alias", async () => {
  const result = await run(selected(), [{ label: "SQLD" }]);
  expect(result.success).toBe(true);
  result.input.value = "SQL 개발자";
  result.input.dispatchEvent(new Event("input", { bubbles: true }));
  expect(
    matchesResultValue(
      result.item,
      result.input.value,
      "SQL 개발자",
      result.handle,
    ),
  ).toBe(false);
});

it("does not retain a Greeting alias after its checked site code changes", async () => {
  const result = await run(selected(), [{ label: "SQLD" }]);
  expect(result.success).toBe(true);
  document
    .querySelector('[data-state="checked"]')
    ?.setAttribute("data-value", "different-code");
  expect(
    matchesResultValue(
      result.item,
      result.input.value,
      "SQL 개발자",
      result.handle,
    ),
  ).toBe(false);
});

it.each(["SQLD", "SQL 개발자(SQLD)", "ＳＱＬＤ"])(
  "carries explicit profile identity through local binding and selects verified %s",
  async (label) => {
    const result = await run(selected(), [{ label }]);
    expect(result.success).toBe(true);
    expect(result.clicked).toHaveBeenCalledOnce();
    expect(result.input.value).toBe(label);
  },
);
it.each([
  { catalogId: "forged" },
  { catalogVersion: "old" },
  { displayName: "SQL 전문가" },
  { catalogId: "cert:sqlp" },
])("blocks invalid selected metadata %j before writing", async (overrides) => {
  const result = await run(selected(overrides), [{ label: "SQL 개발자" }]);
  expect(result.success).toBe(false);
  expect(result.clicked).not.toHaveBeenCalled();
  expect(result.input.value).toBe("");
});
it("rejects ambiguous aliases without using a direct input fallback", async () => {
  const result = await run(selected(), [
    { label: "SQLD" },
    { label: "SQL 개발자(SQLD)" },
    { label: "직접 입력하기:“SQL 개발자”" },
  ]);
  expect(result.success).toBe(false);
  expect(result.clicked).not.toHaveBeenCalled();
  expect(result.input.value).toBe("");
});
it.each([
  undefined,
  { status: "manual", originalText: "SQL" } as ProfileIdentity,
])(
  "does not infer SQLD from legacy/manual SQL",
  async (identity) => {
    const result = await run(identity, [{ label: "SQLD" }], false, "SQL");
    expect(result.success).toBe(false);
    expect(result.clicked).not.toHaveBeenCalled();
    expect(result.input.value).toBe("");
  },
  8000,
);
it("rejects a catalog alias shared by different certificates even with one visible candidate", async () => {
  const result = await run(selected(), [{ label: "shared" }]);
  expect(result.success).toBe(false);
  expect(result.clicked).not.toHaveBeenCalled();
}, 8000);
it("does not select SQLP for a selected SQLD", async () => {
  const result = await run(selected(), [{ label: "SQLP" }]);
  expect(result.success).toBe(false);
  expect(result.clicked).not.toHaveBeenCalled();
}, 8000);
it.each([false, true])(
  "requires visible campus evidence (visible=%s)",
  async (visible) => {
    const result = await run(
      selected({ catalogId: "school:seoul", displayName: "예시대학교" }),
      [{ label: "예시대학교", ...(visible ? { detail: "서울 캠퍼스" } : {}) }],
      true,
    );
    expect(result.success).toBe(visible);
    expect(result.clicked.mock.calls).toEqual(visible ? [[0]] : []);
  },
  8000,
);
it.each([
  undefined,
  { status: "manual", originalText: "SQLD" } as ProfileIdentity,
])(
  "preserves legacy/manual exact strings without catalog inference",
  async (identity) => {
    const result = await run(identity, [{ label: "SQLD" }], false, "SQLD");
    expect(result.success).toBe(true);
    expect(result.input.value).toBe("SQLD");
  },
);
it("rolls an alias display value back when the site's checked ID changes", async () => {
  const result = await run(selected(), [
    { label: "SQLD", commitId: "other-site-id" },
  ]);
  expect(result.success).toBe(false);
  expect(result.clicked).toHaveBeenCalledOnce();
  expect(result.input.value).toBe("");
});
it("does not accept hidden campus evidence", async () => {
  const result = await run(
    selected({ catalogId: "school:seoul", displayName: "예시대학교" }),
    [{ label: "예시대학교", detail: "서울 캠퍼스", hiddenDetail: true }],
    true,
  );
  expect(result.success).toBe(false);
  expect(result.clicked).not.toHaveBeenCalled();
}, 8000);
it("disambiguates same-name campuses using visible exact detail", async () => {
  const result = await run(
    selected({ catalogId: "school:seoul", displayName: "예시대학교" }),
    [
      { label: "예시대학교", detail: "부산 캠퍼스" },
      { label: "예시대학교", detail: "서울 캠퍼스" },
    ],
    true,
  );
  expect(result.success).toBe(true);
  expect(result.clicked.mock.calls).toEqual([[1]]);
});
