/** Synthetic public-template structure T:1066–1580,3639–3773,3969–4041;
 * W:1750–1972. Synthetic codes/values, no applicant data or network. */
import {
  syntheticNativePolicy,
  mountSyntheticNative,
} from "./hplace-mrs2-native.synthetic";
import { installExecutionPolicy } from "../../workflow/execution-policy";
import { collectFieldsSnapshot } from "../../dom/collect";
import { nativeOwnership } from "../native-form-collection";
import type { ReviewPlanItem } from "../../review/review-plan";
export function mountSearch(
  kind = "college",
  configure?: (section: any) => void,
) {
  mountSyntheticNative(0);
  const policy = syntheticNativePolicy();
  if (policy.browserPolicy?.schemaVersion !== 2) throw new Error();
  const section: any = {
    id: "synthetic-search",
    title: "합성 검색",
    selector: "#synthetic-row",
    enabled: true,
    anchors: [],
    fields: [
      {
        name: "synthetic.search.name",
        rawName: "entry.name",
        type: "text",
        label: "이름",
        binding: {
          type: "DIRECT",
          profileFieldKey:
            kind === "major"
              ? "education.university.majorName"
              : kind === "license"
                ? "certifications.certificate.name"
                : kind === "foreignExam"
                  ? "languages.languageTest.testName"
                  : "education.university.schoolName",
        },
        driver: { stage: 1, timeoutMs: 100, dependencies: [], settled: [] },
        search: {
          protocol: "KEYPRESS_COMMITTED_TUPLE",
          catalogKind:
            kind === "major"
              ? null
              : kind === "highschool"
                ? "highSchool"
                : kind === "college"
                  ? "university"
                  : kind === "license"
                    ? "certificate"
                    : "languageTest",
          widgetSelector: "div.span",
          querySelector: `div.search > label > input[type=search][data-type=${kind}]`,
          resultsSelector: "div.search > div.searchResult",
          displaySelector: ":scope > span.searchResultName",
          codeName: "entry.code",
          resultSelector:
            "ul.searchResultList > li > button.ellipsis[data-code][title]",
          kind:
            kind === "foreignExam"
              ? "EXAM"
              : kind === "license"
                ? "LICENSE"
                : "PLAIN",
          metadata:
            kind === "foreignExam"
              ? {
                  grade: "data-gradeflag",
                  score: "data-scoreflag",
                  setup: "data-setupcode",
                  value: "data-setupvalue",
                  perfect: "data-perfactgrade",
                }
              : kind === "license"
                ? { score: "data-usescore", registration: "data-privateinfo" }
                : {},
          timeoutMs: 100,
          ...(kind === "foreignExam"
            ? {
                detailSelector: '[data-template="detail"]',
                gradeName: "entry.gradeCode",
                scoreName: "entry.score",
                registrationName: "entry.registNumber",
                protectedSelector: ".ybmValidateDone:not(.hide),[readonly]",
                protectedValueNames: ["entry.languageExamSn"],
                forbiddenCodes: ["00091"],
              }
            : kind === "license"
              ? { registrationName: "entry.registNumber" }
              : {}),
        },
      },
    ],
  };
  configure?.(section);
  policy.browserPolicy.nativeForm.capabilities.push("KEYPRESS_COMMITTED_TUPLE");
  policy.browserPolicy.nativeForm.sections = [section];
  document
    .querySelector("#wrapResume")!
    .insertAdjacentHTML(
      "beforeend",
      `<section id="synthetic-row"><div class="span"><div class="search"><label><input type="search" data-type="${kind}"></label><div class="searchResult"></div></div><input type="hidden" name="entry.name"><span class="searchResultName"></span><input type="text" class="hidden" name="entry.code"></div><div data-template="detail"><input type="hidden" name="entry.languageExamSn"></div><button type="button" data-button="reset">reset</button></section>`,
    );
  installExecutionPolicy(document, policy);
  return policy;
}
export function widget() {
  return {
    name: document.querySelector<HTMLInputElement>('[name="entry.name"]')!,
    code: document.querySelector<HTMLInputElement>('[name="entry.code"]')!,
    display: document.querySelector<HTMLElement>(".searchResultName")!,
  };
}
export function searchItem(value: string, suffix = "name") {
  const snap = collectFieldsSnapshot(document),
    field = snap.request.sections
      .flatMap((s) => [
        ...s.fields,
        ...(s.items ?? []).flatMap((i) => i.fields),
      ])
      .find((f) => f.domName?.endsWith(suffix));
  if (!field) throw new Error("search candidate not collected");
  const lookup = snap.registry.lookupField(field.candidateId);
  if (!("handle" in lookup)) throw new Error();
  const binding = nativeOwnership(lookup.handle)!.field.binding;
  const item = {
    candidateId: field.candidateId,
    selected: true,
    disabled: false,
    profileValue: value,
    profileFieldKey: binding.profileFieldKey,
    analysis: {
      candidateId: field.candidateId,
      matchType: "MATCH",
      valueBinding: binding,
      autofillPolicy: "ALLOWED",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: {
        command: suffix === "gradeCode" ? "SELECT_OPTION" : "SET_TEXT",
      },
    },
  } as ReviewPlanItem;
  return { handle: lookup.handle, item, snap };
}
export function showResults(
  query: Element,
  titles: string[],
  click?: () => void,
  code = "123",
  metadata: Record<string, string> = {},
) {
  const box = query.closest("div.search")!.querySelector(".searchResult")!;
  box.replaceChildren();
  const ul = document.createElement("ul");
  ul.className = "searchResultList";
  box.append(ul);
  for (const title of titles) {
    const li = document.createElement("li"),
      b = document.createElement("button");
    b.type = "button";
    b.className = "ellipsis";
    b.dataset.code = code;
    b.title = title;
    b.textContent = title;
    if (query.getAttribute("data-type") === "license") {
      b.dataset.usescore = "false";
      b.dataset.privateinfo = "true";
    }
    Object.entries(metadata).forEach(([k, v]) => b.setAttribute(k, v));
    li.append(b);
    ul.append(li);
    b.addEventListener("click", () => {
      const w = widget();
      w.name.value = title;
      w.code.value = code;
      w.display.textContent = title;
      click?.();
    });
  }
}
