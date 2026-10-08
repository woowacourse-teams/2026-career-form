import { CATALOG, CATALOG_VERSION } from "../../../profile/catalog";
import { approveCatalogMatch } from "../../profile/catalog-identity";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../../dom/candidate-registry";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { executeApprovedWrites } from "../../write/native-executor";
import { runHyundaiEducationSearch } from "./school-search";
import { hyundaiWriteAdapter } from "./write";

export type HyundaiCatalogControl =
  | "highSchool"
  | "university"
  | "graduateSchool"
  | "languageTest"
  | "certificate";
export type HyundaiCatalogQaMode =
  | "happy"
  | "duplicate"
  | "no-detail"
  | "stale-query"
  | "stale-identity"
  | "wrong-kind"
  | "protected"
  | "wrong-code"
  | "cancel";

/** Synthetic DOM/vendor behavior only. Matching and writing use production modules. */
export function createHyundaiCatalogFixture(
  document: Document,
  kind: HyundaiCatalogControl,
  mode: HyundaiCatalogQaMode = "happy",
) {
  const entry = CATALOG.find(
    (candidate) =>
      candidate.kind === kind &&
      (kind !== "languageTest" || candidate.id === "languageTest:opic"),
  )!;
  const fieldKey =
    kind === "certificate"
      ? "certifications.certificate.name"
      : kind === "languageTest"
        ? "languages.languageTest.testName"
        : `education.${kind}.schoolName`;
  const identity = {
    status: "selected" as const,
    catalogId: entry.id,
    catalogVersion: CATALOG_VERSION,
    displayName: entry.name,
    originalText: entry.name,
  };
  const approval = approveCatalogMatch(identity, fieldKey, entry.name);
  if (approval.status !== "selected")
    throw new Error("Fixture entry is not approved");
  const school = !["certificate", "languageTest"].includes(kind);
  // Schools have no bundled aliases; spacing exercises distinct query/result values.
  const label = school
    ? entry.name.replace(/^(.)(.)/u, "$1 $2")
    : (approval.match.labels.find((value) => value !== entry.name) ??
      entry.name);
  const domName = school
    ? "schNm"
    : kind === "certificate"
      ? "nationLicNm"
      : "foreExamCd";
  document.body.innerHTML = school
    ? `<article id="academic" class="field-form-apply"><div class="field-content"><div class="field search"><input type="hidden" name="schCd"><input type="text" name="schNm" id="schNm_1" data-auto-type="school" data-auto-api="0200" data-auto-params="${kind === "highSchool" ? "0045" : "0047"}"><ul class="search-result-list"></ul></div></div></article>`
    : kind === "languageTest"
      ? `<article id="foreignExam" class="field-form-apply"><div class="field-content"><div class="select-wrap"><input type="hidden" class="js-field" name="foreExamCd"><input type="button" id="foreExamCd_1"><div class="select-option"></div></div></div></article>`
      : `<article id="licence" class="field-form-apply"><div class="field-content"><input type="text" id="nationLicNm_1" name="nationLicNm"></div></article>`;
  const display = document.querySelector<HTMLInputElement>(`#${domName}_1`)!;
  const hidden = document.querySelector<HTMLInputElement>("input[type=hidden]");
  const results = document.querySelector<HTMLElement>(
    school ? ".search-result-list" : ".select-option",
  );
  const handle: FieldCandidateHandle = {
    kind: "field",
    candidateId: "catalog-fixture",
    sectionId: school
      ? "academic"
      : kind === "certificate"
        ? "licence"
        : "foreignExam",
    itemGroupId: school ? `education${kind.toLowerCase()}` : undefined,
    signature: createStructuralSignature([display]),
    elements: [display],
    optionElements: new Map(),
    candidate: {
      candidateId: "catalog-fixture",
      element: "input",
      control: kind === "languageTest" ? "button" : "text",
      visibility: "visible",
      domId: display.id,
      ...(kind === "languageTest" ? {} : { domName }),
    },
  };
  const item: ReviewPlanItem = {
    candidateId: handle.candidateId,
    fieldLabel: "catalog fixture",
    profileFieldKey: fieldKey,
    currentValue: "",
    profileValue: entry.name,
    previewValue: entry.name,
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "fixture",
    searchIdentity: identity,
    catalogMatch: approval.match,
    analysis: {
      candidateId: handle.candidateId,
      matchType: "MATCH",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      autofillPolicy: "ALLOWED",
      writePlan: {
        command: kind === "languageTest" ? "SELECT_BUTTON_OPTION" : "SET_TEXT",
      },
      valueBinding:
        kind === "languageTest"
          ? {
              type: "BUTTON_OPTION",
              profileFieldKey: fieldKey,
              optionMap: { [entry.name]: "POLICY EXAM" },
              optionCodeMap: { "POLICY EXAM": "old-code" },
            }
          : { type: "DIRECT", profileFieldKey: fieldKey },
    },
  };
  if (kind === "languageTest") item.profileValue = "POLICY EXAM";
  if (mode === "stale-identity")
    item.searchIdentity = { ...identity, catalogVersion: "stale" };
  if (mode === "wrong-kind") {
    const other = CATALOG.find((candidate) => candidate.kind !== kind)!;
    item.searchIdentity = {
      ...identity,
      catalogId: other.id,
      displayName: other.name,
    };
  }
  if (mode === "protected") {
    display.value = "User value";
    if (hidden) hidden.value = "USER";
  }
  let clicks = 0;
  const controller = new AbortController();
  const respond = () => {
    if (!results) return;
    const options = [];
    for (let index = 0; index < (mode === "duplicate" ? 2 : 1); index++) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.code = "SITE-42";
      const container = document.createElement(school ? "li" : "div");
      if (school) {
        button.className = "auto_result";
        button.dataset.search =
          mode === "stale-query" ? "Previous query" : display.value;
        button.dataset.result = label;
        if (mode !== "no-detail") {
          const detail = document.createElement("span");
          detail.id = `catalog-detail-${index}`;
          detail.textContent = entry.detail;
          button.setAttribute("aria-describedby", detail.id);
          container.append(detail);
        }
      }
      button.addEventListener("click", () => {
        clicks++;
        display.value = label;
        if (hidden)
          hidden.value = mode === "wrong-code" ? "WRONG" : button.dataset.code!;
        if (school) display.dataset.searchResult = label;
      });
      container.prepend(button);
      options.push(container);
    }
    results.replaceChildren(...options);
    if (mode === "cancel") controller.abort();
  };
  if (school) display.addEventListener("keyup", respond);
  else if (kind === "languageTest") display.addEventListener("click", respond);
  const run = async () => {
    if (school)
      return runHyundaiEducationSearch(
        document,
        handle,
        item,
        controller.signal,
      );
    if (kind === "languageTest") {
      const attempt = hyundaiWriteAdapter.tryWrite(handle, item);
      return attempt.handled && attempt.written;
    }
    const registry = new CandidateRegistry();
    registry.registerField(handle);
    return (
      executeApprovedWrites({
        registry,
        items: [item],
        approvedCandidateIds: new Set([item.candidateId]),
      })[0]?.status === "written"
    );
  };
  return {
    entry,
    label,
    display,
    hidden,
    results,
    handle,
    item,
    controller,
    run,
    clicks: () => clicks,
  };
}

/** No-Vitest browser QA:
 * From frontend/, bundle with the installed Vite API (Node ESM):
 * import { build } from 'vite';
 * await build({ configFile: false, build: { outDir: '/tmp/hyundai-catalog-qa',
 *   emptyOutDir: true, lib: { entry: 'src/autofill/adapters/hyundai/catalog-qa.test-fixtures.ts',
 *   name: 'HyundaiCatalogQa', formats: ['iife'], fileName: () => 'hyundai-catalog-qa.js' } } });
 * Serve a synthetic blank page at https://talent.hyundai.com/apply/applyWrite.hc
 * using the QA browser's request interception, then inject that generated JS file.
 * await HyundaiCatalogQa.runHyundaiCatalogQa(document, 'happy');
 * Expected: five written reports; four SITE-42 codes/one click each; plain-text certificate has no code/click.
 * duplicate rejects schools/exam; no-detail/stale-query/cancel reject schools only;
 * stale-identity/wrong-kind/protected reject all five. Modes do not invent certificate choices.
 * For retention: const f = HyundaiCatalogQa.createHyundaiCatalogFixture(document, 'languageTest');
 * await f.run(); await f.run(); // true twice, f.clicks() === 1
 * f.hidden.value = 'CHANGED'; await f.run(); // false, changed value preserved
 * School controls require full, unique, visible, exclusively owned aria-describedby detail.
 * Native label-region strings without that verified detail are deliberately not supported.
 * This replaces body content; never invoke on a real application. No submit/save/network actions.
 * This exercises adapter writes, not the extension panel, backend, real vendor API, or saved submission.
 */
export async function runHyundaiCatalogQa(
  document: Document,
  mode: HyundaiCatalogQaMode = "happy",
) {
  const reports = [];
  for (const kind of [
    "highSchool",
    "university",
    "graduateSchool",
    "languageTest",
    "certificate",
  ] as const) {
    const fixture = createHyundaiCatalogFixture(document, kind, mode);
    const written = await fixture.run();
    reports.push({
      kind,
      written,
      label: fixture.display.value,
      code: fixture.hidden?.value ?? null,
      clicks: fixture.clicks(),
    });
  }
  return reports;
}
