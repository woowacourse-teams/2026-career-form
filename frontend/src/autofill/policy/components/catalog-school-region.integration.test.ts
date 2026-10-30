import { fixturePolicy } from "../../../test/fixtures/execution-policy";
import { usePolicyFixture } from "../../../test/fixtures/execution-policy";
usePolicyFixture("greeting");
import { afterEach, expect, it, vi } from "vitest";
import { CATALOG_VERSION } from "../../../profile/catalog";
import {
  createEmptyProfile,
  type ProfileIdentity,
} from "../../../profile/model";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../../dom/candidate-registry";
import { buildReviewPlan } from "../../review/review-plan";
import { componentWorkflowAdapter } from "./workflow";
import type { FieldCandidateHandle } from "../../dom/types";
import type { FieldsAnalyzeResponse } from "../../api/types";
import type { WriteFailureCode } from "../../write/failure";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "../../workflow/execution-policy";
import { matchesResultValue } from "../../workflow/result-value-match";

// Observed Greeting school options (2026-10-07): high schools show the name and
// one sido abbreviation as item-description; universities show only the name.
// The catalog has three 강동고등학교 records: 대구, 서울 (this one) and 울산.
const HIGH_SCHOOL = {
  section: "highSchool",
  name: "educationalBackground.highSchool.schoolName",
  school: "강동고등학교",
  catalogId: "highSchool:kess:110041601:fc3a718f5d1bacf6",
};
const UNIVERSITY = {
  section: "university",
  name: "educationalBackground.universities.0.schoolName",
  school: "서울대학교",
  catalogId: "university:kess:51012000:a7149b19bd06a284",
};

afterEach(() => document.body.replaceChildren());

type Option = { description?: string; hidden?: boolean; checked?: boolean };
interface RunOptions {
  identity?: "selected" | "manual" | "none";
  /** Stored schoolRegion of the same profile entry. */
  region?: string;
  /** Rerun: the field already holds the school and reopens a retained list. */
  existing?: boolean;
  policy?: ExecutionPolicy;
}

function identityOf(
  target: typeof HIGH_SCHOOL,
  identity: RunOptions["identity"],
): ProfileIdentity | undefined {
  if (identity === "none") return undefined;
  if (identity === "manual")
    return { status: "manual", originalText: target.school };
  return {
    status: "selected",
    catalogId: target.catalogId,
    displayName: target.school,
    originalText: target.school,
    catalogVersion: CATALOG_VERSION,
  };
}

function render(
  target: typeof HIGH_SCHOOL,
  options: Option[],
  existing: boolean,
) {
  const items = options
    .map(
      (option, i) =>
        `<div role="option" data-scope="combobox" data-part="item" data-state="${option.checked ? "checked" : "unchecked"}" data-value="S${i}">${target.school}${option.description ? `<span data-part="item-description" ${option.hidden ? "hidden" : ""}>${option.description}</span>` : ""}<div data-part="item-indicator"></div></div>`,
    )
    .join("");
  const popup = `<div id="choices" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open">${items}</div>`;
  document.body.innerHTML = `<input name="${target.name}" data-scope="combobox" data-part="input" role="combobox" aria-controls="choices">${existing ? "" : popup}<div data-scope="field" data-part="root"><label>이름</label><input name="basicInformation.name"></div><div data-scope="field" data-part="root"><label>전화</label><input name="basicInformation.phoneNumber.nationalNumber"></div>`;
  const input = document.querySelector<HTMLInputElement>("input")!;
  let container: ParentNode = document;
  if (existing) {
    // Greeting unmounts a closed list and remounts it, with the retained
    // option checked, when the input is clicked.
    input.value = target.school;
    input.setAttribute("aria-expanded", "false");
    const positioner = document.createElement("div");
    positioner.setAttribute("data-scope", "combobox");
    positioner.setAttribute("data-part", "positioner");
    positioner.innerHTML = `<div data-scope="scroll-area" data-part="root">${popup}</div>`;
    container = positioner;
    input.onclick = () => {
      document.body.append(positioner);
      input.setAttribute("aria-expanded", "true");
    };
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      positioner.remove();
      input.setAttribute("aria-expanded", "false");
    });
  }
  const clicked = vi.fn();
  container
    .querySelectorAll<HTMLElement>('[role="option"]')
    .forEach((option, i) => {
      option.onclick = () => {
        clicked(i);
        input.value = target.school;
        option.setAttribute("data-state", "checked");
        input.setAttribute("aria-expanded", "false");
      };
    });
  return { input, clicked };
}

async function run(
  target: typeof HIGH_SCHOOL,
  options: Option[],
  { identity = "selected", region, existing = false, policy }: RunOptions = {},
) {
  if (policy) installExecutionPolicy(document, policy);
  const profile = createEmptyProfile();
  const entryIdentity = identityOf(target, identity);
  profile.education.push({
    id: "entry",
    sectionId: target.section,
    values: {
      schoolName: target.school,
      ...(region === undefined ? {} : { schoolRegion: region }),
    },
    ...(entryIdentity ? { identity: entryIdentity } : {}),
  });
  const { input, clicked } = render(target, options, existing);
  const handle = {
    kind: "field",
    candidateId: "f",
    sectionId: "section",
    itemIndex: 0,
    signature: createStructuralSignature([input]),
    candidate: { candidateId: "f", domName: target.name, control: "text" },
    elements: [input],
    optionElements: new Map(),
  } as unknown as FieldCandidateHandle;
  const registry = new CandidateRegistry();
  registry.registerField(handle);
  const analysis: FieldsAnalyzeResponse = {
    executionPolicy: policy ?? fixturePolicy("greeting"),
    snapshotId: "snapshot",
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: [
      {
        candidateId: "f",
        matchType: "MATCH",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: `education.${target.section}.schoolName`,
        },
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        autofillPolicy: "ALLOWED",
        writePlan: { command: "SEARCH_SELECTION" },
      },
    ],
  };
  const item = buildReviewPlan({ analysis, registry, profile }).items[0];
  const reported: WriteFailureCode[] = [];
  const success = await componentWorkflowAdapter(document).executeStateDriver!(
    document,
    handle,
    item,
    new AbortController().signal,
    (code) => reported.push(code),
  );
  return { success, clicked, input, item, handle, reported };
}

const SAME_NAME: Option[] = [
  { description: "대구" },
  { description: "서울" },
  { description: "울산" },
];

function expectSelectedSeoul(result: Awaited<ReturnType<typeof run>>) {
  expect(result.success).toBe(true);
  expect(result.clicked.mock.calls).toEqual([[1]]);
  expect(result.input.value).toBe(HIGH_SCHOOL.school);
  expect(result.reported).toEqual([]);
  expect(
    matchesResultValue(
      result.item,
      result.input.value,
      HIGH_SCHOOL.school,
      result.handle,
    ),
  ).toBe(true);
}

function expectAmbiguous(result: Awaited<ReturnType<typeof run>>) {
  expect(result.success).toBe(false);
  expect(result.clicked).not.toHaveBeenCalled();
  expect(result.reported).toEqual(["SEARCH_AMBIGUOUS"]);
  expect(result.input.value).toBe("");
}

it("selects the selected catalog high school among same-name options by its catalog region", async () => {
  expectSelectedSeoul(await run(HIGH_SCHOOL, SAME_NAME));
});

it.each([
  { name: "without catalog identity", identity: "none" as const },
  { name: "for a manual identity", identity: "manual" as const },
])(
  "selects a same-name high school by the profile region $name",
  async ({ identity }) => {
    expectSelectedSeoul(
      await run(HIGH_SCHOOL, SAME_NAME, { identity, region: "region:seoul" }),
    );
  },
);

it("reads a legacy free-text profile region through its standard alias", async () => {
  expectSelectedSeoul(
    await run(HIGH_SCHOOL, SAME_NAME, {
      identity: "none",
      region: "서울특별시",
    }),
  );
});

it("selects the catalog region under a policy without NAME_ONLY", async () => {
  const policy = fixturePolicy("greeting");
  for (const rule of policy.componentPolicy!.searchKinds)
    delete (rule as { matchMode?: string }).matchMode;
  expectSelectedSeoul(await run(HIGH_SCHOOL, SAME_NAME, { policy }));
});

it.each([
  {
    name: "two same-name options show the catalog region",
    options: [
      { description: "서울" },
      { description: "서울" },
      { description: "대구" },
    ],
  },
  {
    name: "no same-name option shows the catalog region",
    options: [{ description: "대구" }, { description: "울산" }],
  },
  {
    name: "a same-name option hides its region",
    options: [{ description: "서울" }, { description: "대구", hidden: true }],
  },
  {
    name: "a same-name option shows no region",
    options: [{ description: "서울" }, {}],
  },
  {
    name: "the region description is not the abbreviation",
    options: [{ description: "서울특별시" }, { description: "대구" }],
  },
])("keeps SEARCH_AMBIGUOUS when $name", async ({ options }) => {
  expectAmbiguous(await run(HIGH_SCHOOL, options));
});

it.each([
  {
    name: "the profile region contradicts the selected catalog region",
    options: { identity: "selected" as const, region: "region:daegu" },
  },
  {
    name: "there is no profile region",
    options: { identity: "none" as const },
  },
  {
    name: "no option shows the profile region",
    options: { identity: "manual" as const, region: "region:busan" },
  },
  {
    name: "the profile region is not a known region",
    options: { identity: "none" as const, region: "어딘가" },
  },
])("does not narrow when $name", async ({ options }) => {
  expectAmbiguous(await run(HIGH_SCHOOL, SAME_NAME, options));
});

it.each([
  { name: "selected catalog", identity: "selected" as const },
  { name: "manual", identity: "manual" as const },
])(
  "rejects a retained $name same-name selection outside the expected region",
  async ({ identity }) => {
    const result = await run(
      HIGH_SCHOOL,
      [{ description: "대구", checked: true }, ...SAME_NAME.slice(1)],
      { identity, region: "region:seoul", existing: true },
    );
    expect(result.success).toBe(false);
    expect(result.clicked).not.toHaveBeenCalled();
    expect(result.reported).toEqual(["SEARCH_AMBIGUOUS"]);
    expect(result.input.value).toBe(HIGH_SCHOOL.school);
  },
);

it.each([
  {
    name: "a selected catalog school contradicted by the profile region",
    options: { identity: "selected" as const, region: "region:daegu" },
  },
  {
    name: "a manual school without a profile region",
    options: { identity: "manual" as const },
  },
  {
    name: "no identity and no profile region",
    options: { identity: "none" as const },
  },
])("rejects a retained same-name selection for $name", async ({ options }) => {
  const result = await run(
    HIGH_SCHOOL,
    [{ description: "대구", checked: true }, ...SAME_NAME.slice(1)],
    { ...options, existing: true },
  );
  expect(result.success).toBe(false);
  expect(result.clicked).not.toHaveBeenCalled();
  expect(result.reported).toEqual(["SEARCH_AMBIGUOUS"]);
  expect(result.input.value).toBe(HIGH_SCHOOL.school);
});

it.each([
  { name: "selected catalog", identity: "selected" as const },
  { name: "manual", identity: "manual" as const },
])(
  "confirms a retained $name same-name selection in the expected region",
  async ({ identity }) => {
    const result = await run(
      HIGH_SCHOOL,
      [SAME_NAME[0], { description: "서울", checked: true }, SAME_NAME[2]],
      { identity, region: "region:seoul", existing: true },
    );
    expect(result.success).toBe(true);
    expect(result.clicked).not.toHaveBeenCalled();
    expect(result.input.value).toBe(HIGH_SCHOOL.school);
  },
);

it.each([
  { name: "another sido only", options: [{ description: "대구" }] },
  { name: "no visible sido", options: [{}] },
  { name: "hidden sido", options: [{ description: "서울", hidden: true }] },
  {
    name: "duplicate matching sido",
    options: [{ description: "서울" }, { description: "서울" }],
  },
  { name: "unrelated description", options: [{ description: "서울 캠퍼스" }] },
])(
  "applies NAME_ONLY high-school uniqueness for $name",
  async ({ name, options }) => {
    const result = await run(HIGH_SCHOOL, options);
    const unique = !name.startsWith("duplicate");
    expect(result.success).toBe(unique);
    expect(result.clicked.mock.calls).toEqual(unique ? [[0]] : []);
    expect(result.input.value).toBe(unique ? result.item.profileValue : "");
  },
  8000,
);

it("selects a description-less university when every same-name campus shares the school code", async () => {
  const result = await run(UNIVERSITY, [{}]);
  expect(result.success).toBe(true);
  expect(result.clicked.mock.calls).toEqual([[0]]);
  expect(
    matchesResultValue(
      result.item,
      result.input.value,
      UNIVERSITY.school,
      result.handle,
    ),
  ).toBe(true);
});

it.each([
  {
    name: "a same-name school with another school code",
    target: {
      ...UNIVERSITY,
      school: "국립한밭대학교",
      catalogId: "university:kess:51030000:a7149b19bd06a284",
    },
    options: [{}],
  },
  {
    name: "an unverified description",
    target: UNIVERSITY,
    options: [{ description: "부산" }],
  },
  { name: "duplicate options", target: UNIVERSITY, options: [{}, {}] },
])(
  "applies NAME_ONLY university uniqueness for $name",
  async ({ name, target, options }) => {
    const result = await run(target, options);
    const unique = !name.startsWith("duplicate");
    expect(result.success).toBe(unique);
    expect(result.clicked.mock.calls).toEqual(unique ? [[0]] : []);
    expect(result.input.value).toBe(unique ? result.item.profileValue : "");
  },
  8000,
);
