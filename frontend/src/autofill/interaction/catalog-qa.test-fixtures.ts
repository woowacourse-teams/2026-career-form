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
  | "post-edit"
  | "approved-follow-up"
  | "undeclared-code"
  | "empty-direct"
  | "legacy-direct"
  | "nonempty-direct"
  | "readonly-direct"
  | "duplicate-direct"
  | "confirm-selection"
  | "legacy-confirm-selection"
  | "ambiguous-confirm-selection"
  | "submit-confirm-selection"
  | "name-only-selection"
  | "generic-confirm-link"
  | "legacy-confirm-link"
  | "unsafe-confirm-link"
  | "generic-confirm-link-filtered"
  | "legacy-confirm-link-filtered";

/** Synthetic DOM only. Call on a disposable same-origin document, never an application. */
export async function runGenericCatalogQa(
  document: Document,
  mode: GenericCatalogQaMode = "school",
) {
  document.body.innerHTML = `<section data-repeater-item><div><label>검색 대상<input id="catalog-target" type="text" readonly></label><input id="catalog-code" type="hidden"><button id="catalog-opener" type="button">검색</button></div><label>보존할 값<input id="catalog-peer" value="protected"></label></section>`;
  const target = document.querySelector<HTMLInputElement>("#catalog-target")!;
  const code = document.querySelector<HTMLInputElement>("#catalog-code")!;
  const filteredConfirmMode =
    mode === "generic-confirm-link-filtered" ||
    mode === "legacy-confirm-link-filtered";
  const linkConfirmMode =
    mode === "generic-confirm-link" ||
    mode === "legacy-confirm-link" ||
    mode === "unsafe-confirm-link" ||
    filteredConfirmMode;
  const nameOnlyMode = mode === "name-only-selection" || linkConfirmMode;
  if (nameOnlyMode) code.remove();
  const peer = document.querySelector<HTMLInputElement>("#catalog-peer")!;
  if (mode === "approved-follow-up") peer.value = "";
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
  const directMode = mode.endsWith("-direct");
  const confirmMode =
    mode === "confirm-selection" ||
    mode === "legacy-confirm-selection" ||
    mode === "ambiguous-confirm-selection" ||
    mode === "submit-confirm-selection" ||
    linkConfirmMode;
  const guardedConfirmMode = confirmMode && mode !== "legacy-confirm-selection";
  if (directMode)
    Object.assign(catalogMatch, {
      labels: [catalogMatch.query, ...catalogMatch.labels],
    });
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
  const directActions = { open: 0, confirm: 0 };
  const confirmActions = { confirm: 0, submit: 0 };
  const controller = new AbortController();
  let approved = true;
  opener.addEventListener("click", () => {
    actions.open++;
    const surface = document.createElement("div");
    surface.id = "catalog-dialog";
    if (!filteredConfirmMode) {
      surface.setAttribute("role", "dialog");
      surface.setAttribute("aria-modal", "true");
    }
    opener.setAttribute("aria-controls", surface.id);
    surface.innerHTML = `<label>검색어<input id="catalog-query" type="text"></label><button id="catalog-submit" type="button">검색</button><ul aria-label="검색 결과"></ul>`;
    let register: HTMLButtonElement | undefined;
    if (confirmMode) {
      const registerHost = document.createElement(
        mode === "submit-confirm-selection" ? "form" : "div",
      );
      registerHost.id = "catalog-confirm-controls";
      if (registerHost instanceof HTMLFormElement) {
        registerHost.addEventListener("submit", (event) => {
          event.preventDefault();
          confirmActions.submit++;
        });
      }
      register = document.createElement("button");
      register.type = mode === "submit-confirm-selection" ? "submit" : "button";
      register.textContent = "등록";
      register.disabled = true;
      registerHost.append(register);
      if (mode === "ambiguous-confirm-selection") {
        const duplicate = register.cloneNode(true) as HTMLButtonElement;
        registerHost.append(duplicate);
      }
      surface.append(registerHost);
      const confirm = (button: HTMLButtonElement) => {
        const form = button.form;
        confirmActions.confirm++;
        target.value = "Site QA";
        code.value = "QA-1";
        surface.remove();
        if (button.type === "submit") {
          // A trusted browser click would submit its owning form; keep that real
          // event path observable for the executor's submit-suppression check.
          form?.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
        }
      };
      register.addEventListener("click", () => confirm(register!));
      registerHost.querySelectorAll("button").forEach((button) => {
        if (button !== register)
          button.addEventListener("click", () => confirm(button));
      });
    }
    document.body.append(surface);
    const query = surface.querySelector<HTMLInputElement>("input")!;
    const root = surface.querySelector<HTMLElement>("ul")!;
    if (filteredConfirmMode) {
      root.removeAttribute("aria-label");
      const resultWrapper = document.createElement("div");
      root.replaceWith(resultWrapper);
      resultWrapper.append(root);
      root.innerHTML = `<li><a href="javascript:">Site QA</a></li><li><a href="javascript:">Another result</a></li>`;
      root.querySelector("li a")!.addEventListener("click", (event) => {
        event.preventDefault();
        actions.select++;
        register!.disabled = false;
      });
    }
    if (directMode) {
      const direct = document.createElement("button");
      direct.type = "button";
      direct.textContent = "직접입력";
      surface.append(direct);
      if (mode === "duplicate-direct") surface.append(direct.cloneNode(true));
      const manual = document.createElement("div");
      manual.hidden = true;
      manual.innerHTML = `<label>이름 직접입력<input type="text"></label><button type="button">확인</button>`;
      surface.append(manual);
      const manualInput = manual.querySelector<HTMLInputElement>("input")!;
      manualInput.readOnly = mode === "readonly-direct";
      direct.addEventListener("click", () => {
        directActions.open++;
        query.hidden = true;
        surface.querySelector<HTMLButtonElement>("#catalog-submit")!.hidden =
          true;
        direct.hidden = true;
        manual.hidden = false;
      });
      manual.querySelector("button")!.addEventListener("click", () => {
        directActions.confirm++;
        target.value = manualInput.value;
        code.value = "MANUAL-1";
        surface.remove();
      });
    }
    surface.querySelector("button")!.addEventListener("click", () => {
      actions.search++;
      if (!filteredConfirmMode) {
        root.setAttribute("data-search-query", query.value);
        root.setAttribute("data-search-complete", "true");
      }
      if (filteredConfirmMode) {
        const replacement = document.createElement("div");
        replacement.innerHTML = `<div><span>${query.value}<button type="reset"></button></span></div>`;
        query.replaceWith(replacement.firstElementChild!);
        root.removeChild(root.children[1]!);
        return;
      }
      if (directMode) {
        const nonempty = mode === "nonempty-direct";
        root.setAttribute("data-result-count", nonempty ? "1" : "0");
        root.innerHTML = nonempty
          ? "<li><button type='button'>Different result</button></li>"
          : "";
        if (!surface.querySelector("[data-zero-notice]")) {
          const notice = document.createElement("p");
          notice.dataset.zeroNotice = "true";
          notice.textContent = "검색 결과가 없습니다.";
          if (!nonempty) surface.append(notice);
        }
        return;
      }
      root.setAttribute("data-result-count", mode === "duplicate" ? "2" : "1");
      const resultControl = linkConfirmMode
        ? `<a href="${mode === "unsafe-confirm-link" ? "javascript:alert(1)" : "javascript:"}">Site QA</a>`
        : `<button type="button" ${mode === "undeclared-code" || nameOnlyMode ? "" : 'data-code="QA-1"'} ${school && mode !== "missing-detail" ? 'aria-describedby="catalog-campus"' : ""}>Site QA</button>`;
      root.innerHTML = `<li>${resultControl}${school ? '<span id="catalog-campus">Campus QA</span>' : ""}</li>`;
      if (mode === "duplicate")
        root.append(root.firstElementChild!.cloneNode(true));
      root.querySelectorAll<HTMLElement>("button, a[href]").forEach((action) =>
        action.addEventListener("click", (event) => {
          if (action instanceof HTMLAnchorElement) event.preventDefault();
          actions.select++;
          if (confirmMode) {
            surface
              .querySelectorAll<HTMLButtonElement>(
                "#catalog-confirm-controls button",
              )
              .forEach((button) => (button.disabled = false));
            return;
          }
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
    ...((directMode && mode !== "legacy-direct") ||
    (confirmMode &&
      mode !== "legacy-confirm-selection" &&
      mode !== "legacy-confirm-link" &&
      mode !== "legacy-confirm-link-filtered") ||
    mode === "undeclared-code" ||
    mode === "approved-follow-up" ||
    mode === "name-only-selection"
      ? { genericPopupRecovery: true }
      : {}),
    decisionProvider: provider,
    assertCurrent: () => approved,
    signal: controller.signal,
    beforeMutation: async () => {
      if (mode === "post-edit" && actions.select) code.value = "POST-EDIT";
      return true;
    },
  });
  return {
    result,
    requests,
    actions,
    target,
    code,
    peer,
    snapshot,
    directActions,
    confirmActions,
  };
}
