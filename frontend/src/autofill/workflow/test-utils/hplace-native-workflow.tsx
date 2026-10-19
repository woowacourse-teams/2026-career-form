/**
 * Render harness for MRS2 native-form workflow tests (CF-177 C0).
 * Pattern copied from AutofillWorkflow.hplace-education.test.tsx (that file is
 * left unchanged): every native field is answered ADAPTER_VERIFIED/READY with
 * its policy binding and a control-specific write plan, and every preparation
 * candidate gets ADD_REPEATABLE_GROUP.
 *
 * Mount the page first (mountEducation / mountCareer), then render. Counters
 * live on `#frm` listeners, so they vanish with the mounted DOM.
 */
import { render } from "@testing-library/react";
import { AutofillWorkflow } from "../AutofillWorkflow";
import type { ExecutionPolicy } from "../execution-policy";
import type { Profile } from "../../../profile/model";
import type {
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
  PreparationAnalyzeRequest,
  PreparationAnalyzeResponse,
} from "../../api/types";

export interface SearchResult {
  title: string;
  code: string;
  /** Extra `data-*` attributes on the result button (e.g. usescore). */
  data?: Readonly<Record<string, string>>;
}
/** `undefined` = the site never answers; `[]` = the site's no-result box. */
export type SearchCatalog = (
  query: string,
  kind: string,
) => readonly SearchResult[] | undefined;
export type SearchResponder = (
  query: HTMLInputElement,
  event: KeyboardEvent,
) => void;
export interface NativeWorkflowCounters {
  /** analyzeFields calls. */
  requests: number;
  /** analyzePreparation calls. */
  preparations: number;
  /** keypress events on search queries (whether or not the site sees Enter). */
  keypresses: number;
  /** `[data-button=add]` clicks (row and nested major add). */
  adds: number;
  /** `[data-button=addCollege]` clicks. */
  parentAdds: number;
  /** submits and remove/reset/removeCollege/resetSearchResult/submit/file clicks. */
  forbidden: number;
}
export interface RenderNativeWorkflowOptions {
  policy: ExecutionPolicy;
  profile: Profile;
  /** Omit for a site that never answers searches. */
  searchResponder?: SearchResponder;
  /** Optional post-processing of each analyzeFields response. */
  shapeFields?: (
    response: FieldsAnalyzeResponse,
    request: FieldsAnalyzeRequest,
  ) => FieldsAnalyzeResponse;
}
export interface NativeWorkflowRender {
  counters: NativeWorkflowCounters;
  requests: FieldsAnalyzeRequest[];
}

type NativeRule = { name: string; binding: unknown };
const nativeRules = (policy: ExecutionPolicy): NativeRule[] => {
  const browser = policy.browserPolicy;
  if (!browser || browser.schemaVersion !== 2 || !browser.nativeForm)
    throw new Error("renderNativeWorkflow needs a native-form policy");
  return browser.nativeForm.sections.flatMap(
    (s) => s.fields as readonly NativeRule[],
  );
};

/** ADAPTER_VERIFIED/READY answer for every requested native field. */
export function nativeFieldsAnalysis(
  request: FieldsAnalyzeRequest,
  policy: ExecutionPolicy,
): FieldsAnalyzeResponse {
  const rules = nativeRules(policy);
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    executionPolicy: policy,
    fields: request.sections
      .flatMap((s) => [
        ...s.fields,
        ...(s.items ?? []).flatMap((i) => i.fields),
      ])
      .flatMap((f) => {
        const rule = rules.find((x) => x.name === f.domName);
        if (!rule) return [];
        return [
          {
            candidateId: f.candidateId,
            matchType: "MATCH",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "READY",
            autofillPolicy: "ALLOWED",
            valueBinding: rule.binding,
            writePlan: {
              command:
                f.control === "select"
                  ? "SELECT_OPTION"
                  : f.control === "radio"
                    ? "CHECK_RADIO"
                    : "SET_TEXT",
            },
          } as FieldsAnalyzeResponse["fields"][number],
        ];
      }),
  };
}

export function nativePreparationAnalysis(
  request: PreparationAnalyzeRequest,
): PreparationAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    preparationPlans: request.sections
      .flatMap((s) => [
        ...s.actionCandidates,
        ...(s.items ?? []).flatMap((i) => i.actionCandidates),
      ])
      .map((a) => ({
        command: "ADD_REPEATABLE_GROUP",
        expectedEffect: "GROUP_COUNT_INCREMENT",
        actionCandidateId: a.candidateId,
      })),
  };
}

/** Every query has exactly one result whose title equals the query. */
export const exactTitleCatalog = (codeBase = 900001): SearchCatalog => {
  const codes = new Map<string, string>();
  return (query) => {
    if (query && !codes.has(query))
      codes.set(query, String(codeBase + codes.size));
    return query ? [{ title: query, code: codes.get(query)! }] : [];
  };
};

/**
 * Site-like search results (W:1820–1900 semantics, reimplemented): renders
 * `ul.searchResultList > li > button.ellipsis[data-code][title]`, and a click
 * fills the hidden name, the display span and the `.hidden` code input, then
 * focuses the code input (which starts the linkedForm focus poll).
 * `accept` decides whether the site sees the keypress; pass C1's
 * `siteSeesEnter` for page-world Enter fidelity. Default: `key === "Enter"`.
 */
export function catalogResponder(
  catalog: SearchCatalog,
  {
    accept = (e: KeyboardEvent) => e.key === "Enter",
  }: { accept?: (event: KeyboardEvent) => boolean } = {},
): SearchResponder {
  return (query, event) => {
    if (!accept(event)) return;
    const widget = query.closest("div.span");
    const results = widget?.querySelector(".searchResult");
    if (!widget || !results) return;
    const found = catalog(query.value, query.dataset.type ?? "");
    if (!found) return;
    if (!found.length) {
      results.innerHTML = '<div class="noResult"></div>';
      return;
    }
    const list = document.createElement("ul");
    list.className = "searchResultList";
    for (const result of found) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ellipsis";
      button.dataset.code = result.code;
      button.title = result.title;
      button.textContent = result.title;
      for (const [key, value] of Object.entries(result.data ?? {}))
        button.setAttribute(`data-${key}`, value);
      button.onclick = () => {
        const name = widget.querySelector<HTMLInputElement>(
          ':scope > input[type="hidden"][name$="Name"]',
        );
        const code = widget.querySelector<HTMLInputElement>(
          ':scope > input.hidden[name$="Code"]',
        );
        const display = widget.querySelector(":scope > span.searchResultName");
        if (name) name.value = result.title;
        if (display) {
          const label = document.createElement("span");
          label.textContent = result.title;
          const reset = document.createElement("button");
          reset.type = "button";
          reset.className = "resetSearchResult";
          reset.dataset.button = "resetSearchResult";
          display.replaceChildren(label, reset);
        }
        if (code) {
          code.value = result.code;
          code.focus();
        }
      };
      item.append(button);
      list.append(item);
    }
    results.replaceChildren(list);
  };
}

const FORBIDDEN =
  "[data-button=remove],[data-button=reset],[data-button=removeCollege],[data-button=resetSearchResult],button[type=submit],input[type=file]";

export function renderNativeWorkflow({
  policy,
  profile,
  searchResponder,
  shapeFields = (r) => r,
}: RenderNativeWorkflowOptions): NativeWorkflowRender {
  const form = document.querySelector("#frm");
  if (!form) throw new Error("mount the native page before rendering");
  const counters: NativeWorkflowCounters = {
    requests: 0,
    preparations: 0,
    keypresses: 0,
    adds: 0,
    parentAdds: 0,
    forbidden: 0,
  };
  const requests: FieldsAnalyzeRequest[] = [];
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    counters.forbidden++;
  });
  form.addEventListener("keypress", (e) => {
    const query = e.target;
    if (!(query instanceof HTMLInputElement) || query.type !== "search") return;
    counters.keypresses++;
    searchResponder?.(query, e as KeyboardEvent);
  });
  form.addEventListener(
    "click",
    (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (el.matches("[data-button=add]")) counters.adds++;
      if (el.matches("[data-button=addCollege]")) counters.parentAdds++;
      if (el.matches(FORBIDDEN)) counters.forbidden++;
    },
    true,
  );
  render(
    <AutofillWorkflow
      pageDocument={document}
      onExit={() => {}}
      repository={{ load: async () => profile }}
      apiClient={{
        loadExecutionPolicy: async () => policy,
        analyzeFields: async (request) => {
          counters.requests++;
          requests.push(request);
          return shapeFields(nativeFieldsAnalysis(request, policy), request);
        },
        analyzePreparation: async (request) => {
          counters.preparations++;
          return nativePreparationAnalysis(request);
        },
      }}
    />,
  );
  return { counters, requests };
}
