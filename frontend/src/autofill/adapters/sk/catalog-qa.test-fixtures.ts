import { CATALOG, CATALOG_VERSION } from "../../../profile/catalog";
import { approveCatalogMatch } from "../../profile/catalog-identity";
import { retainedCatalogSelection } from "../../profile/catalog-receipt";
import { createStructuralSignature } from "../../dom/candidate-registry";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { skWorkflowAdapter } from "./workflow";
import {
  installSkAutocompleteMainBridge,
  type SkAutocompleteInstance,
  type SkAutocompleteItem,
  type SkJQuery,
} from "./autocomplete-main";

export type SkCatalogQaMode =
  | "certificate"
  | "exam"
  | "school"
  | "school-missing"
  | "school-hidden"
  | "school-shared"
  | "school-mismatch"
  | "duplicate"
  | "stale"
  | "wrongkind"
  | "malformed"
  | "protected"
  | "cancelled"
  | "code-changed"
  | "code-changed-on-click"
  | "row-changed";

/** Run on a disposable intercepted https://www.skcareers.com/Application/Index/qa page.
 * Uses the production workflow, isolated bridge and MAIN handler; no test runner imports.
 * DOM is retained for inspection; call the returned cleanup when finished.
 */
export async function runSkCatalogQa(
  document: Document,
  mode: SkCatalogQaMode = "certificate",
) {
  if (
    document.location.host !== "www.skcareers.com" ||
    !document.location.pathname.startsWith("/Application/Index/")
  )
    throw new Error("SK QA requires the exact intercepted SK application URL");
  const school = mode.startsWith("school");
  const exam = mode === "exam";
  const kind = school ? "university" : exam ? "languageTest" : "certificate";
  const entry = CATALOG.find(
    (entry) => entry.kind === kind && (school || entry.aliases.length > 0),
  )!;
  const profileFieldKey = school
    ? "education.university.schoolName"
    : exam
      ? "languages.languageTest.testName"
      : "certifications.certificate.name";
  const searchIdentity = {
    status: "selected" as const,
    catalogId: entry.id,
    displayName: entry.name,
    originalText: entry.name,
    catalogVersion: CATALOG_VERSION,
  };
  const approval = approveCatalogMatch(
    searchIdentity,
    profileFieldKey,
    entry.name,
  );
  if (approval.status !== "selected")
    throw new Error("SK QA catalog approval unavailable");
  const item = {
    profileFieldKey,
    profileValue: entry.name,
    searchIdentity,
    catalogMatch: approval.match,
  } as ReviewPlanItem;
  const label = school
    ? entry.name
    : approval.match.labels.find((label) => label !== entry.name)!;
  if (mode === "stale")
    item.searchIdentity = { ...searchIdentity, catalogVersion: "old" };
  if (mode === "wrongkind")
    item.catalogMatch = { ...approval.match, kind: "languageTest" };
  if (mode === "malformed")
    item.catalogMatch = { ...approval.match, labels: [] };
  const controller = new AbortController();
  if (mode === "cancelled") controller.abort();
  const context = { item, signal: controller.signal };
  const root = document.createElement("section");
  root.setAttribute("data-sk-catalog-qa", mode);
  const row = document.createElement("div");
  row.className = `form-item-group ${school ? "educationUniv-item" : exam ? "langExam-Item" : "cert-Item"}`;
  const input = document.createElement("input");
  input.name = school
    ? "eduEducationName"
    : exam
      ? "lngExamName"
      : "cerCertName";
  if (mode === "protected") input.value = "Existing user value";
  row.append(input);
  if (exam) {
    const score = document.createElement("input");
    score.name = "lngExamScore";
    row.append(score);
  }
  const menu = document.createElement("ul");
  menu.className = "ui-autocomplete";
  root.append(row, menu);
  document.body.append(root);
  const instance: SkAutocompleteInstance = {
    menu: { element: { 0: menu, length: 1 } },
    term: "",
    pending: 0,
  };
  const candidates = new WeakMap<Element, SkAutocompleteItem>();
  let confirmed = false;
  let clicks = 0;
  let searches = 0;
  for (let i = 0; i < (mode === "duplicate" ? 2 : 1); i++) {
    const option = document.createElement("li");
    option.className = "ui-menu-item";
    const action = document.createElement("div");
    action.className = "ui-menu-item-wrapper";
    action.textContent = label;
    const candidate = { id: String(88 + i), label, value: label };
    candidates.set(option, candidate);
    option.append(action);
    menu.append(option);
    action.addEventListener("click", () => {
      clicks++;
      input.value = candidate.value;
      instance.selectedItem = candidate;
      confirmed = true;
      if (mode === "code-changed-on-click") candidate.id = "other-code";
    });
    if (school && mode !== "school-missing") {
      const detail = document.createElement("span");
      detail.id = `sk-qa-detail-${crypto.randomUUID()}`;
      detail.textContent =
        mode === "school-mismatch"
          ? "Other campus"
          : approval.match.requiredDetail!;
      detail.hidden = mode === "school-hidden";
      menu.append(detail);
      option.setAttribute("aria-describedby", detail.id);
      if (mode === "school-shared") {
        const other = document.createElement("li");
        other.setAttribute("aria-describedby", detail.id);
        menu.append(other);
      }
    }
  }
  const jquery: SkJQuery = (element) => ({
    data: (key) =>
      key === "ui-autocomplete-item"
        ? candidates.get(element)
        : element === input
          ? key === "confirmed"
            ? confirmed
            : key === "ui-autocomplete"
              ? instance
              : undefined
          : undefined,
    autocomplete: (command, value) => {
      if (element !== input) return undefined;
      if (command === "search") {
        searches++;
        instance.term = value;
        instance.pending = 0;
        return undefined;
      }
      return instance;
    },
  });
  const uninstall = installSkAutocompleteMainBridge(document, jquery);
  const handle: FieldCandidateHandle = {
    kind: "field",
    candidateId: "sk-qa",
    candidate: {
      candidateId: "sk-qa",
      element: "input",
      control: "text",
      visibility: "visible",
      domName: input.name,
    },
    elements: [input],
    optionElements: new Map(),
    sectionId: "qa",
    itemId: "qa",
    itemIndex: 0,
    signature: createStructuralSignature([input]),
  };
  const ready = await skWorkflowAdapter.waitForStateDriverReady!(
    document,
    handle,
    undefined,
    context,
  );
  const failures: string[] = [];
  let selected = false;
  if (ready) {
    input.value = entry.name;
    selected = await skWorkflowAdapter.settleStateDriver!(
      document,
      handle,
      (code) => failures.push(code),
      context,
    );
  }
  const retainedBefore = retainedCatalogSelection(item, input);
  if (mode === "code-changed" && instance.selectedItem)
    instance.selectedItem.id = "other-code";
  if (mode === "row-changed") {
    const replacement = document.createElement("div");
    replacement.className = row.className;
    root.append(replacement);
    replacement.append(input);
  }
  const retainedAfter = retainedCatalogSelection(item, input);
  return {
    mode,
    ready,
    selected,
    clicks,
    searches,
    value: input.value,
    selectedCode: String(instance.selectedItem?.id ?? ""),
    retainedBefore,
    retainedAfter,
    failures,
    input,
    root,
    cleanup: () => {
      uninstall();
      root.remove();
    },
  };
}
