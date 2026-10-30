import {
  fixturePolicy,
  usePolicyFixture,
} from "../../../test/fixtures/execution-policy";
usePolicyFixture("greeting", { capWaits: true });
import { afterEach, expect, it, vi } from "vitest";
import { CATALOG_VERSION } from "../../../profile/catalog";
import { createEmptyProfile } from "../../../profile/model";
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

// The catalog (KESS) names this campus without the college number Greeting
// lists, e.g. "한국폴리텍 I 대학 서울정수캠퍼스".
const SCHOOL = "한국폴리텍대학 서울정수캠퍼스";
const CATALOG_ID = "university:kess:Z3110000:a7149b19bd06a284";
const NAME = "educationalBackground.universities.0.schoolName";
const SITE = "한국폴리텍 I 대학 서울정수캠퍼스";
const CREATE = `직접 입력하기:“${SCHOOL}”`;

afterEach(() => document.body.replaceChildren());

function render(labels: string[], existing?: string) {
  const items = labels
    .map(
      (label, i) =>
        `<div role="option" data-scope="combobox" data-part="item" data-state="${label === existing ? "checked" : "unchecked"}" data-value="${label === CREATE ? "[[new]]" : `U${i}`}">${label}<div data-part="item-indicator"></div></div>`,
    )
    .join("");
  const popup = `<div id="choices" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open">${items}</div>`;
  document.body.innerHTML = `<input name="${NAME}" data-scope="combobox" data-part="input" role="combobox" aria-controls="choices">${existing ? "" : popup}`;
  const input = document.querySelector<HTMLInputElement>("input")!;
  let container: ParentNode = document;
  if (existing) {
    // Greeting remounts a closed list, with the retained option checked, on click.
    input.value = existing;
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
        clicked(labels[i]);
        input.value = labels[i];
        option.setAttribute("data-state", "checked");
        input.setAttribute("aria-expanded", "false");
      };
    });
  return { input, clicked };
}

async function run(
  labels: string[],
  { existing, policy }: { existing?: string; policy?: ExecutionPolicy } = {},
) {
  if (policy) installExecutionPolicy(document, policy);
  const profile = createEmptyProfile();
  profile.education.push({
    id: "entry",
    sectionId: "university",
    values: { schoolName: SCHOOL },
    identity: {
      status: "selected",
      catalogId: CATALOG_ID,
      displayName: SCHOOL,
      originalText: SCHOOL,
      catalogVersion: CATALOG_VERSION,
    },
  });
  const { input, clicked } = render(labels, existing);
  const handle = {
    kind: "field",
    candidateId: "f",
    sectionId: "section",
    itemIndex: 0,
    signature: createStructuralSignature([input]),
    candidate: { candidateId: "f", domName: NAME, control: "text" },
    elements: [input],
    optionElements: new Map(),
  } as unknown as FieldCandidateHandle;
  const registry = new CandidateRegistry();
  registry.registerField(handle);
  const analysis: FieldsAnalyzeResponse = {
    executionPolicy: policy ?? fixturePolicy("greeting", { capWaits: true }),
    snapshotId: "snapshot",
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: [
      {
        candidateId: "f",
        matchType: "MATCH",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: "education.university.schoolName",
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

const LISTED = [
  SITE,
  "한국폴리텍 I 대학 서울강서캠퍼스",
  "한국폴리텍 I 대학 성남캠퍼스",
  "한국폴리텍 II 대학 인천캠퍼스",
  CREATE,
];

function expectSiteCampus(result: Awaited<ReturnType<typeof run>>) {
  expect(result.success).toBe(true);
  expect(result.clicked.mock.calls).toEqual([[SITE]]);
  expect(result.input.value).toBe(SITE);
  expect(result.reported).toEqual([]);
  expect(
    matchesResultValue(result.item, result.input.value, SCHOOL, result.handle),
  ).toBe(true);
}

it("selects the site's numbered campus for a numeral-less catalog university", async () => {
  expectSiteCampus(await run(LISTED));
});

it("selects the numbered campus without NAME_ONLY", async () => {
  const policy = fixturePolicy("greeting", { capWaits: true });
  for (const rule of policy.componentPolicy!.searchKinds)
    delete (rule as { matchMode?: string }).matchMode;
  expectSiteCampus(await run(LISTED, { policy }));
});

it("reports no exact match when only other campuses are listed", async () => {
  const result = await run(LISTED.slice(1));
  expect(result.success).toBe(false);
  expect(result.clicked).not.toHaveBeenCalled();
  expect(result.reported).toEqual(["SEARCH_NO_EXACT_MATCH"]);
  expect(result.input.value).toBe("");
});

it("reports ambiguity for two numbered variants of the same campus", async () => {
  const result = await run([SITE, "한국폴리텍 II 대학 서울정수캠퍼스", CREATE]);
  expect(result.success).toBe(false);
  expect(result.clicked).not.toHaveBeenCalled();
  expect(result.reported).toEqual(["SEARCH_AMBIGUOUS"]);
  expect(result.input.value).toBe("");
});

it("keeps a retained numbered campus on rerun without reselecting", async () => {
  const result = await run(LISTED, { existing: SITE });
  expect(result.item.status).toBe("conflict");
  expect(result.success).toBe(true);
  expect(result.clicked).not.toHaveBeenCalled();
  expect(result.input.value).toBe(SITE);
  expect(
    matchesResultValue(result.item, result.input.value, SCHOOL, result.handle),
  ).toBe(true);
});
