import { CATALOG, CATALOG_VERSION } from "../../profile/catalog";
import { createEmptyProfile } from "../../profile/model";
import {
  collectFieldsSnapshot,
  collectFieldsSnapshotWithDropdowns,
} from "../dom/collect";
import { mountButtonDropdowns } from "../dom/button-dropdown.fixture";
import { buildReviewPlan } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "./executor";

export type NativeCatalogQaMode =
  "select" | "dropdown" | "ambiguous" | "invalid" | "legacy" | "post-edit";
export type NativeCatalogQaKind = "certificate" | "languageTest" | "university";

/** Owned synthetic document only. realLayout uses actual browser geometry. */
export async function runNativeCatalogQa(
  document: Document,
  mode: NativeCatalogQaMode,
  kind: NativeCatalogQaKind = "certificate",
  realLayout = false,
) {
  const entry =
    kind === "university"
      ? CATALOG.find((candidate) => candidate.kind === kind)!
      : CATALOG.find(
          (candidate) =>
            candidate.id ===
            (kind === "certificate"
              ? "certificate:kdata:sqld"
              : "languageTest:opic"),
        )!;
  const label =
    kind === "certificate"
      ? "SQLD"
      : kind === "languageTest"
        ? "오픽"
        : entry.name;
  const profile = createEmptyProfile();
  const category =
    kind === "certificate"
      ? "certifications"
      : kind === "languageTest"
        ? "languages"
        : "education";
  const section =
    kind === "certificate"
      ? "certificate"
      : kind === "languageTest"
        ? "languageTest"
        : "university";
  const field =
    kind === "certificate"
      ? "name"
      : kind === "languageTest"
        ? "testName"
        : "schoolName";
  const key = `${category}.${section}.${field}`;
  profile[category] = [
    {
      id: "qa-entry",
      sectionId: section,
      values: {
        [field]: mode === "legacy" ? label : entry.name,
        details: "보존할 원문",
      },
      ...(mode === "legacy"
        ? {}
        : {
            identity: {
              status: "selected" as const,
              catalogId: mode === "invalid" ? "unknown" : entry.id,
              displayName: entry.name,
              originalText: label,
              catalogVersion: CATALOG_VERSION,
            },
          }),
    },
  ];
  const beforeProfile = JSON.stringify(profile);
  let dropdown: HTMLElement | undefined;
  let select: HTMLSelectElement | undefined;
  let clicks = 0;
  if (mode === "dropdown") {
    const fixture = mountButtonDropdowns({ count: 1 });
    dropdown = fixture.triggers[0];
    const menu = fixture.menus[0];
    dropdown.setAttribute("aria-label", "카탈로그 선택");
    dropdown.setAttribute("data-value", "");
    const options = menu.querySelectorAll<HTMLElement>('[role="menuitem"]');
    options[0].textContent = label;
    options[0].setAttribute("data-value", "site-0");
    options[1].textContent = "다른 항목";
    options[1].setAttribute("data-value", "other");
    if (kind === "university") {
      const detail = document.createElement("span");
      detail.id = "qa-campus";
      detail.textContent = entry.detail;
      menu.append(detail);
      options[0].setAttribute("aria-describedby", detail.id);
    }
    menu.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const option = event.target.closest<HTMLElement>('[role="menuitem"]');
      if (!option) return;
      clicks++;
      dropdown!.setAttribute(
        "data-value",
        option.getAttribute("data-value") ?? "",
      );
    });
    if (realLayout) {
      Reflect.deleteProperty(dropdown, "getBoundingClientRect");
      Reflect.deleteProperty(menu, "getBoundingClientRect");
      dropdown.style.cssText =
        "padding:12px;border:1px solid #666;width:300px;cursor:pointer";
      dropdown.addEventListener("click", () => {
        const bounds = dropdown!.getBoundingClientRect();
        menu.style.cssText = `position:fixed;left:${bounds.left}px;top:${bounds.bottom}px;width:${bounds.width}px;background:white;padding:12px;border:1px solid #666`;
      });
      options.forEach((option) => {
        option.style.cssText = "padding:12px;cursor:pointer";
      });
    }
  } else {
    document.body.innerHTML =
      '<fieldset id="qa-field"><legend>카탈로그 선택</legend></fieldset><input id="protected" value="기존 합성값">';
    const root = document.getElementById("qa-field")!;
    select = document.createElement("select");
    select.setAttribute("aria-label", "카탈로그 선택");
    select.name = "catalog-choice";
    select.append(new Option("선택", ""), new Option("다른 항목", "other"));
    const option = new Option(label, "site-0");
    select.append(option);
    root.append(select);
    if (kind === "university") {
      const detail = document.createElement("span");
      detail.id = "qa-campus";
      detail.textContent = entry.detail;
      option.setAttribute("aria-describedby", detail.id);
      root.append(detail);
      const second = new Option(label, "site-1");
      second.setAttribute("aria-describedby", "qa-other-campus");
      select.append(second);
      const secondDetail = document.createElement("span");
      secondDetail.id = "qa-other-campus";
      secondDetail.textContent =
        mode === "ambiguous" ? entry.detail : "다른 캠퍼스";
      root.append(secondDetail);
    }
  }
  const snapshot =
    mode === "dropdown"
      ? await collectFieldsSnapshotWithDropdowns(document)
      : collectFieldsSnapshot(document);
  const target = snapshot.request.sections
    .flatMap((part) => [
      ...part.fields,
      ...(part.items?.flatMap((item) => item.fields) ?? []),
    ])
    .find((candidate) => candidate.control === "select");
  if (!target) throw new Error("QA select was not collected");
  const staticPolicy = mode === "post-edit";
  const items = buildReviewPlan({
    profile,
    registry: snapshot.registry,
    analysis: {
      snapshotId: snapshot.request.snapshotId,
      mode: staticPolicy ? "ADAPTER" : "GENERIC",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: target.candidateId,
          matchType: "MATCH",
          mappingStatus: staticPolicy ? "ADAPTER_VERIFIED" : "LLM_SUGGESTED",
          interactionStatus: "READY",
          autofillPolicy: "ALLOWED",
          valueBinding: { type: "DIRECT", profileFieldKey: key },
          writePlan: { command: "SELECT_OPTION" },
        },
      ],
    },
  }).items;
  let edited = false;
  const results = await executeApprovedWritesAfterPageSettles({
    items,
    registry: snapshot.registry,
    document,
    approvedCandidateIds: new Set([target.candidateId]),
    onResult: (_item, result) => {
      if (
        mode === "post-edit" &&
        select &&
        result.status === "written" &&
        !edited
      ) {
        edited = true;
        select.selectedOptions[0].value = "user-changed-code";
      }
    },
  });
  return {
    mode,
    kind,
    status: results.find((result) => result.candidateId === target.candidateId)
      ?.status,
    results,
    expectedLabel: label,
    label:
      select?.selectedOptions[0]?.textContent ?? dropdown?.textContent ?? "",
    code: select?.value ?? dropdown?.getAttribute("data-value") ?? "",
    protectedValue: document.querySelector<HTMLInputElement>("input")?.value,
    profileUnchanged: JSON.stringify(profile) === beforeProfile,
    clicks,
    edited,
    cleanup: () => {
      document.body.onmousedown = null;
      document.body.replaceChildren();
    },
  };
}
