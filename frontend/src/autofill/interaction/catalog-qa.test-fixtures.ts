import { collectFieldsSnapshot } from "../dom/collect";
import type {
  InteractionDecisionRequest,
  InteractionDecisionProvider,
} from "../api/interaction-types";
import type { ApprovedCatalogMatch } from "../profile/catalog-match";
import { executeReadonlySearch } from "./readonly-search-executor";

export type GenericCatalogQaMode =
  | "school"
  | "certificate"
  | "exam"
  | "duplicate"
  | "missing-detail"
  | "malformed"
  | "wrong-kind"
  | "stale"
  | "protected-peer"
  | "cancel"
  | "user-edit"
  | "post-edit";

/** Synthetic DOM only. Call on a disposable same-origin document, never an application. */
export async function runGenericCatalogQa(
  document: Document,
  mode: GenericCatalogQaMode = "school",
) {
  document.body.innerHTML = `<section data-repeater-item><div><label>검색 대상<input id="catalog-target" type="text" readonly></label><input id="catalog-code" type="hidden"><button id="catalog-opener" type="button">검색</button></div><label>보존할 값<input id="catalog-peer" value="protected"></label></section>`;
  const target = document.querySelector<HTMLInputElement>("#catalog-target")!;
  const code = document.querySelector<HTMLInputElement>("#catalog-code")!;
  const peer = document.querySelector<HTMLInputElement>("#catalog-peer")!;
  const opener = document.querySelector<HTMLButtonElement>("#catalog-opener")!;
  const snapshot = collectFieldsSnapshot(document);
  const candidate = snapshot.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items?.flatMap((item) => item.fields) ?? []),
    ])
    .find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return (
        lookup.status === "blocked" && lookup.handle.elements[0] === target
      );
    })!;
  const school = mode === "school" || mode === "missing-detail";
  const kind = school
    ? "university"
    : mode === "exam"
      ? "languageTest"
      : "certificate";
  const canonicalFieldKey = school
    ? "education.university.schoolName"
    : mode === "exam"
      ? "languages.languageTest.testName"
      : "certifications.certificate.name";
  const catalogMatch: ApprovedCatalogMatch = {
    kind,
    query: "Canonical QA",
    labels: ["Site QA", "Another alias"],
    ...(school ? { requiredDetail: "Campus QA" } : {}),
  };
  if (mode === "malformed") Object.assign(catalogMatch, { labels: [] });
  if (mode === "wrong-kind")
    Object.assign(catalogMatch, { kind: "languageTest" });
  const requests: InteractionDecisionRequest[] = [];
  const provider: InteractionDecisionProvider = async (request) => {
    requests.push(request);
    return {
      schemaVersion: 2,
      status: "COMPLETE",
      mode: "GENERIC",
      snapshotId: request.snapshotId,
      decisions: request.decisions.map((decision) => ({
        decisionId: decision.decisionId,
        role: decision.role,
        selection: "SELECTED",
        candidateId: decision.candidates[0]!.candidateId,
      })),
    };
  };
  const actions = { open: 0, search: 0, select: 0 };
  const controller = new AbortController();
  let approved = true;
  opener.addEventListener("click", () => {
    actions.open++;
    const surface = document.createElement("div");
    surface.id = "catalog-dialog";
    surface.setAttribute("role", "dialog");
    surface.setAttribute("aria-modal", "true");
    opener.setAttribute("aria-controls", surface.id);
    surface.innerHTML = `<label>검색어<input id="catalog-query" type="text"></label><button id="catalog-submit" type="button">검색</button><ul aria-label="검색 결과"></ul>`;
    document.body.append(surface);
    const query = surface.querySelector<HTMLInputElement>("input")!;
    const root = surface.querySelector<HTMLElement>("ul")!;
    surface.querySelector("button")!.addEventListener("click", () => {
      actions.search++;
      root.setAttribute("data-search-query", query.value);
      root.setAttribute("data-search-complete", "true");
      root.setAttribute("data-result-count", mode === "duplicate" ? "2" : "1");
      root.innerHTML = `<li><button type="button" data-code="QA-1" ${school && mode !== "missing-detail" ? 'aria-describedby="catalog-campus"' : ""}>Site QA</button>${school ? '<span id="catalog-campus">Campus QA</span>' : ""}</li>`;
      if (mode === "duplicate")
        root.append(root.firstElementChild!.cloneNode(true));
      root.querySelectorAll("button").forEach((action) =>
        action.addEventListener("click", () => {
          actions.select++;
          target.value = "Site QA";
          code.value = "QA-1";
          if (mode === "protected-peer") peer.value = "changed";
          surface.remove();
        }),
      );
      if (mode === "cancel") controller.abort();
      if (mode === "user-edit") target.value = "User edit";
      if (mode === "stale") approved = false;
    });
  });
  const result = await executeReadonlySearch({
    document,
    registry: snapshot.registry,
    targetCandidateId: candidate.candidateId,
    canonicalFieldKey,
    expectedValue: catalogMatch.query,
    expectedCurrentValue: "",
    catalogMatch,
    decisionProvider: provider,
    assertCurrent: () => approved,
    signal: controller.signal,
    beforeMutation: async () => {
      if (mode === "post-edit" && actions.select) code.value = "POST-EDIT";
      return true;
    },
  });
  return { result, requests, actions, target, code, peer };
}
