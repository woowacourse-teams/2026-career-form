import { localWorkflowLog } from "../debug/local-workflow";
import {
  schoolRegionOption,
  schoolRegionSearchValues,
} from "../../profile/standard-values";
import { isAutofillProfileFieldKey } from "../profile/profile-field-key";
import {
  normalized,
  observeReadonlySearch,
  safeSearchOpener,
  searchOpeners,
  targetIsCurrent,
  controlSignature,
  type ExecuteReadonlySearchArgs,
  type ReadonlySearchExecutionResult,
  type SearchEffect,
  type SurfaceLeftOpenReason,
  type TargetIdentity,
} from "./readonly-search";
import { SearchFailure, SearchSession } from "./search-session";
import { debugSearchFailure, debugSearchStep } from "../debug/autofill-debug";
import { clickVerifiedJsResult } from "./js-result-click-bridge";
import {
  completeRegionList,
  regionListSelection,
} from "./queryless-region-list";
import { observeSearchSurfaces } from "./search-surface-detector";
import {
  queryControls,
  queryOnly,
  resolveRoles,
  searchDestination,
  submitControls,
  lockedSubmitControls,
  isIconSearchSubmit,
} from "./search-controls";
import { observeResults, resultBaseline } from "./search-results";
import { observeQueryCommit } from "./search-query-commit";
import {
  bindSelectionEffects,
  verifyRetainedSelectionEffects,
  verifySelectionEffects,
} from "./search-selection-effects";
import { captureSearchFollowUp } from "./search-follow-up";
import {
  interactive,
  elements,
  safeActivation,
  shown,
  label,
} from "./search-surface-dom";
import type { SearchSurface } from "./search-surface";
import { isSafeSurfaceCloseClick } from "../generic/click-policy";
import { queryCandidates } from "./readonly-search-popup";

import { resultActivation } from "./search-result-structure";
import { bindStructuredEffects } from "./search-result-effects";
import {
  isApprovedCatalogMatch,
  type CatalogEvidence,
} from "../profile/catalog-match";

const activeTransactions = new WeakSet<Document>();
export function acceptedSearchValues(
  key: string,
  value: string,
): readonly string[] {
  return key.endsWith(".schoolRegion")
    ? schoolRegionSearchValues(value)
    : [value];
}

function searchAttempts(
  args: ExecuteReadonlySearchArgs,
  fallback: string,
): readonly string[] {
  if (args.catalogMatch && args.genericPopupRecovery !== true)
    return [args.catalogMatch.query];
  if (args.catalogMatch) {
    // Sites index a certificate under its official name or a short alias
    // ("SQL 개발자" vs "SQLD"). Try the approved query first, then its plain
    // catalog aliases; results are still matched only against approved labels.
    const query = args.catalogMatch.query;
    const aliases = args.catalogMatch.labels.filter(
      (label) => !/[()]/.test(label) && normalized(label) !== normalized(query),
    );
    return [
      query,
      ...aliases.filter(
        (label, index) =>
          aliases.findIndex(
            (other) => normalized(other) === normalized(label),
          ) === index,
      ),
    ].slice(0, 3);
  }
  if (!args.searchValues) return [fallback];
  if (
    args.searchValues.length < 1 ||
    args.searchValues.length > 2 ||
    normalized(args.searchValues[0] ?? "") !== normalized(args.expectedValue) ||
    args.searchValues.some((value) => !normalized(value)) ||
    new Set(args.searchValues.map(normalized)).size !== args.searchValues.length
  )
    throw new SearchFailure("stale_target");
  return args.searchValues;
}
/**
 * Click a same-document control that may sit inside the application form.
 * Any submit event the click dispatches is cancelled before page handlers run,
 * and the search fails closed.
 */
function clickWithoutFormSubmit(element: HTMLElement): void {
  const view = element.ownerDocument.defaultView;
  if (!element.closest("form") && !(element as HTMLButtonElement).form) {
    element.click();
    return;
  }
  if (!view) throw new SearchFailure("unverified_search_form");
  let submitted = false;
  const block = (event: Event) => {
    submitted = true;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  view.addEventListener("submit", block, true);
  try {
    element.click();
  } finally {
    view.removeEventListener("submit", block, true);
  }
  if (submitted) throw new SearchFailure("surface_navigation_unsafe");
}
/**
 * Clicks a submit the page itself handles. A submit no page handler cancels
 * would navigate, so it is cancelled here and the search fails closed.
 */
export function clickSubmitHandledByPage(element: HTMLButtonElement): void {
  const view = element.ownerDocument.defaultView;
  if (!view || !element.form) throw new SearchFailure("unverified_search_form");
  let unhandled = false;
  const guard = (event: Event) => {
    if (event.defaultPrevented) return;
    unhandled = true;
    event.preventDefault();
  };
  view.addEventListener("submit", guard);
  try {
    element.click();
  } finally {
    view.removeEventListener("submit", guard);
  }
  if (unhandled) throw new SearchFailure("surface_navigation_unsafe");
}
function nativeQueryValue(
  input: HTMLInputElement,
  value: string,
  guard: () => void,
): void {
  const view = input.ownerDocument.defaultView;
  const setter =
    view &&
    Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, "value")
      ?.set;
  if (!setter || !view) throw new SearchFailure("unverified_search_form");
  const current = () => {
    guard();
    if (
      !input.isConnected ||
      !interactive(input) ||
      input.readOnly ||
      input.value !== value
    )
      throw new SearchFailure("surface_stale");
  };
  setter.call(input, value);
  current();
  input.dispatchEvent(new view.Event("input", { bubbles: true }));
  current();
  input.dispatchEvent(new view.Event("change", { bubbles: true }));
}
function validateRegionContext(
  args: ExecuteReadonlySearchArgs,
  surface: SearchSurface,
): void {
  if (!args.canonicalFieldKey.endsWith(".schoolRegion")) return;
  const countries = elements<HTMLSelectElement>(surface.root, "select").filter(
    interactive,
  );
  if (!countries.length) return;
  if (countries.length !== 1) throw new SearchFailure("unverified_search_form");
  const region = schoolRegionOption(args.expectedValue);
  if (!region || region.value === "region:overseas")
    throw new SearchFailure("unverified_search_form");
  const country = countries[0]!;
  if (
    !["KOR", "KR"].includes(country.value.toUpperCase()) ||
    !["한국", "대한민국", "South Korea", "Korea, Republic of"].includes(
      country.selectedOptions[0]?.textContent?.trim() ?? "",
    )
  )
    throw new SearchFailure("unverified_search_form");
}

/** Prefer bare close; generic failures before result activation may confirm. */
const ESCAPE_CLOSE_TIMEOUT_MS = 5000;

const MODAL_SELECTOR = "dialog[open], [role='dialog'][aria-modal='true']";

async function closedWithin(
  surface: SearchSurface,
  isOpen: () => boolean,
): Promise<boolean> {
  const view = surface.container.ownerDocument.defaultView;
  const deadline = Date.now() + ESCAPE_CLOSE_TIMEOUT_MS;
  while (view && isOpen() && Date.now() < deadline)
    await new Promise((resolve) => view.setTimeout(resolve, 50));
  return !isOpen();
}

async function closedAfterEscape(modal: Element, isOpen: () => boolean) {
  const document = modal.ownerDocument;
  const view = document.defaultView;
  if (!view) return false;
  const focused = document.activeElement;
  const origin = focused && modal.contains(focused) ? focused : modal;
  origin.dispatchEvent(
    new view.KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
  const deadline = Date.now() + ESCAPE_CLOSE_TIMEOUT_MS;
  while (isOpen() && Date.now() < deadline)
    await new Promise((resolve) => view.setTimeout(resolve, 50));
  return !isOpen();
}

function openModals(document: Document): Element[] {
  return Array.from(document.querySelectorAll(MODAL_SELECTOR)).filter(
    (modal) => modal instanceof HTMLElement && shown(modal),
  );
}

/**
 * The opener click can open a modal the surface detector never accepted.
 * Only a single modal that was not open before that click is closed.
 */
export async function closeModalOpenedBy(
  before: ReadonlySet<Element>,
  document: Document,
): Promise<SurfaceLeftOpenReason | undefined> {
  const opened = openModals(document).filter((modal) => !before.has(modal));
  if (opened.length === 0) return undefined;
  if (opened.length > 1) return "no_safe_close_control";
  const modal = opened[0]!;
  return (await closedAfterEscape(
    modal,
    () => modal.isConnected && shown(modal as HTMLElement),
  ))
    ? undefined
    : "close_not_confirmed";
}

export async function closeOwnedSurface(
  surface: SearchSurface,
  allowConfirmation: boolean,
): Promise<SurfaceLeftOpenReason | undefined> {
  if (surface.kind === "inline-listbox") return undefined;
  if (surface.closure() !== "open") return undefined;
  const controls = Array.from(
    surface.container.querySelectorAll<HTMLElement>(
      "button, a[href], input[type=button]",
    ),
  );
  const control =
    controls.find(
      (element) => isSafeSurfaceCloseClick(element, surface.container).allowed,
    ) ??
    (allowConfirmation
      ? controls.find(
          (element) =>
            isSafeSurfaceCloseClick(element, surface.container, {
              allowConfirmation: true,
            }).allowed,
        )
      : undefined);
  if (!control) {
    // A modal without a close control is dismissed the standard way.
    const modal = surface.modal;
    if (!modal) return "no_safe_close_control";
    return (await closedAfterEscape(modal, () => surface.closure() === "open"))
      ? undefined
      : "close_not_confirmed";
  }
  try {
    control.click();
  } catch {
    return "close_not_confirmed";
  }
  if (await closedWithin(surface, () => surface.closure() === "open"))
    return undefined;
  const modal = surface.modal;
  return modal &&
    (await closedAfterEscape(modal, () => surface.closure() === "open"))
    ? undefined
    : "close_not_confirmed";
}

export async function executeReadonlySearch(
  args: ExecuteReadonlySearchArgs,
): Promise<ReadonlySearchExecutionResult> {
  const {
    document,
    registry,
    targetCandidateId,
    canonicalFieldKey,
    expectedValue,
  } = args;
  if (activeTransactions.has(document))
    return {
      status: "skipped",
      targetCandidateId,
      reason: "run_in_progress",
      effect: "none",
    };
  activeTransactions.add(document);
  let step = "시작";
  const trace = (next: string, detail?: unknown) => {
    step = next;
    debugSearchStep(targetCandidateId, next, detail);
  };
  trace("시작", {
    canonicalFieldKey,
    expectedValue,
    expectedCurrentValue: args.expectedCurrentValue,
    searchValues: args.searchValues,
  });
  const session = new SearchSession(args);
  const outerUrl = document.URL;
  // Set just before a fragment result link click: its own fragment URL (C10).
  let allowedFragmentUrl: string | undefined;
  let effect: SearchEffect = "none";
  let identity: TargetIdentity | undefined;
  let surface: SearchSurface | undefined;
  let modalsBeforeOpener: ReadonlySet<Element> | undefined;
  let selectionStarted = false;
  let followUpObservation: ReturnType<typeof captureSearchFollowUp>;
  try {
    session.check();
    if (
      !isAutofillProfileFieldKey(canonicalFieldKey) ||
      !normalized(expectedValue)
    )
      throw new SearchFailure("field_not_readonly");
    const catalogMatch = args.catalogMatch;
    if (catalogMatch !== undefined) {
      const kinds: Readonly<Record<string, string>> = {
        "certifications.certificate.name": "certificate",
        "languages.languageTest.testName": "languageTest",
        "education.highSchool.schoolName": "highSchool",
        "education.university.schoolName": "university",
        "education.graduateSchool.schoolName": "graduateSchool",
      };
      if (
        !isApprovedCatalogMatch(catalogMatch) ||
        catalogMatch.kind !== kinds[canonicalFieldKey] ||
        catalogMatch.query !== expectedValue
      )
        throw new SearchFailure("stale_target");
    }
    const approvedCatalog = JSON.stringify(catalogMatch);
    const lookup = registry.lookupField(targetCandidateId);
    if (lookup.status !== "blocked" || lookup.reason !== "readonly")
      throw new SearchFailure("stale_target");
    const eligibility = observeReadonlySearch(lookup.handle);
    if (eligibility.status !== "eligible")
      throw new SearchFailure(eligibility.reason);
    identity = eligibility.identity;
    const target = identity.target;
    const initialValue = target.value;
    const values = acceptedSearchValues(canonicalFieldKey, expectedValue);
    const attempts = searchAttempts(args, values[0]!);
    trace("검색 대상 확인", { initialValue, values, attempts, target });
    const matchingValues = args.searchValues ? attempts : values;
    const matches = (value: string) =>
      matchingValues.some(
        (candidate) => normalized(candidate) === normalized(value),
      );
    const guard = (expected?: string | readonly string[]) => {
      session.check();
      if (JSON.stringify(args.catalogMatch) !== approvedCatalog)
        throw new SearchFailure("stale_target");
      if (document.URL !== outerUrl && document.URL !== allowedFragmentUrl)
        throw new SearchFailure("surface_navigation_unsafe");
      const result = targetIsCurrent(
        document,
        registry,
        targetCandidateId,
        identity!,
        args.assertCurrent,
        expected,
        surface?.closure() === "open" ? surface.modal : undefined,
        surface?.closure() === "open" ? surface.container : undefined,
      );
      if (typeof result === "string") throw new SearchFailure(result);
      return result.target;
    };
    guard(initialValue);
    if (
      args.expectedCurrentValue !== undefined &&
      normalized(initialValue) !== normalized(args.expectedCurrentValue)
    )
      throw new SearchFailure("stale_target");
    if (normalized(initialValue)) {
      if (catalogMatch || !matches(initialValue))
        throw new SearchFailure("existing_value_conflict");
      await session.prepareMutation();
      guard(values);
      trace("이미 같은 값이 입력되어 변경 없음");
      return { status: "unchanged", targetCandidateId, identity, effect };
    }
    trace("검색 버튼 탐색", identity.fieldGroup);
    const [openerRole] = await resolveRoles(session, [
      {
        role: "SEARCH_POPUP_OPENER",
        scope: identity.fieldGroup,
        collect: () =>
          identity!.selfOpener
            ? [identity!.target]
            : searchOpeners(identity!.fieldGroup).filter(safeSearchOpener),
      },
    ]);
    const opener = openerRole!.binding.element;
    identity.opener = opener as NonNullable<TargetIdentity["opener"]>;
    identity.openerSignature = controlSignature(opener);
    const observation = observeSearchSurfaces(document, identity, session);
    await session.prepareMutation();
    guard(initialValue);
    if (
      !openerRole!.current() ||
      !(identity.selfOpener
        ? opener === identity.target
        : safeSearchOpener(opener)) ||
      !interactive(opener)
    )
      throw new SearchFailure("stale_field_group");
    effect = "interaction-started";
    trace("검색 버튼 클릭", {
      opener,
      flow: "generic",
    });
    modalsBeforeOpener = new Set(openModals(document));
    opener.click();
    surface = await session.wait(
      () => observation.discover(opener),
      "surface_not_found",
    );
    trace("검색 화면 발견", surface);
    // Capture settled opener metadata once its attributed surface has appeared.
    identity.openerSignature = controlSignature(opener);
    identity.openerSignatures = identity.openers.map(controlSignature);
    const currentSurface = surface;
    const regionList = () =>
      completeRegionList(currentSurface, canonicalFieldKey);
    const surfaceGuard = () => {
      // The page may reflect an accepted value while its own surface is open.
      guard([initialValue, ...matchingValues]);
      observation.assertOwned(currentSurface);
      currentSurface.revalidate();
      validateRegionContext(args, currentSurface);
    };
    surfaceGuard();
    const controls = await session.wait(() => {
      surfaceGuard();
      const queries = queryControls(
        currentSurface,
        args.genericPopupRecovery === true,
      );
      const submits = submitControls(currentSurface);
      if (args.genericPopupRecovery) {
        if (queries.length > 1)
          throw new SearchFailure("multiple_search_query_inputs");
        // A visible search button/result shell can precede its query input.
        // Recollect within this wait's existing budget instead of accepting it.
        if (
          !queries.length &&
          (submits.length ||
            queryCandidates(currentSurface.document).some((input) =>
              currentSurface.contains(input),
            ))
        )
          return undefined;
      }
      return queries.length ||
        submits.length ||
        currentSurface.resultRoots().length ||
        regionList()
        ? { queries, submits }
        : undefined;
    }, "search_query_not_found");
    const { queries, submits } = controls;
    let query: HTMLInputElement | undefined;
    let submit: HTMLButtonElement | HTMLInputElement | undefined;
    let queryRole;
    let submitRole;
    let lockedSubmit: HTMLButtonElement | HTMLInputElement | undefined;
    if (queries.length) {
      const roleRequests = [
        {
          role: "SEARCH_QUERY_INPUT" as const,
          collect: () =>
            queryControls(currentSurface, args.genericPopupRecovery === true),
          scope: currentSurface.container,
        },
        ...(submits.length
          ? [
              {
                role: "SEARCH_SUBMIT" as const,
                collect: () => submitControls(currentSurface),
                scope: currentSurface.container,
              },
            ]
          : []),
      ];
      [queryRole, submitRole] = await resolveRoles(session, roleRequests);
      query = queryRole!.binding.element as HTMLInputElement;
      submit = submitRole?.binding.element as typeof submit;
      if (!submit && !queryOnly(currentSurface, query)) {
        const locked =
          args.genericPopupRecovery === true && !submits.length
            ? lockedSubmitControls(currentSurface)
            : [];
        if (locked.length !== 1)
          throw new SearchFailure("search_submit_not_found");
        lockedSubmit = locked[0];
      }
    } else if (
      submits.length ||
      (!currentSurface.resultRoots().length && !regionList())
    ) {
      throw new SearchFailure("search_query_not_found");
    }
    const querylessRegion = !query && Boolean(regionList());
    currentSurface.mode = query
      ? submit || lockedSubmit
        ? "query-and-submit"
        : "query-only"
      : "existing-options";
    trace("검색 입력/실행 버튼 확인", {
      mode: currentSurface.mode,
      queries: queries.length,
      submits: submits.length,
      query,
      submit,
    });
    const initialSearchText = attempts[0]!;
    if (
      query &&
      normalized(query.value) &&
      normalized(query.value) !== normalized(initialSearchText)
    )
      throw new SearchFailure("search_query_conflict");
    let nativeFormBinding =
      query && submit
        ? searchDestination(currentSurface, query, submit)
        : undefined;
    let candidate:
      | { element: HTMLElement; signature: string; evidence?: CatalogEvidence }
      | undefined;
    let selectedResults: ReturnType<typeof observeResults> | undefined;
    let structuredResults:
      | Awaited<ReturnType<ReturnType<typeof observeResults>["interpret"]>>
      | undefined;
    let selectedSearchText = initialSearchText;
    let directEntry:
      | {
          input: HTMLInputElement;
          binding: ReturnType<typeof bindSelectionEffects>;
        }
      | undefined;
    // The page bound the query to the target: the typed text already is the
    // accepted value.
    const reflectedByQuery = () =>
      !directEntry &&
      normalized(identity!.target.value) !== normalized(initialValue) &&
      (catalogMatch
        ? identity!.target.value === expectedValue
        : matchingValues.some(
            (value) => normalized(value) === normalized(identity!.target.value),
          ));
    for (const [attemptIndex, searchText] of attempts.entries()) {
      const attemptValues = args.searchValues ? [searchText] : values;
      trace(`검색 시도 ${attemptIndex + 1}/${attempts.length}`, searchText);
      const baseline = resultBaseline(currentSurface);
      if (baseline.some((entry) => entry.busy === "true"))
        throw new SearchFailure("result_pending");
      currentSurface.queryGeneration++;
      const results = observeResults(
        currentSurface,
        session,
        baseline,
        query ? searchText : undefined,
        args.genericPopupRecovery === true && query
          ? observeQueryCommit(currentSurface, query, searchText)
          : undefined,
      );
      selectedResults = results;
      if (query) {
        const queryElement = query;
        await session.prepareMutation();
        surfaceGuard();
        if (
          !queryRole!.current() ||
          !interactive(queryElement) ||
          queryElement.readOnly
        )
          throw new SearchFailure("surface_stale");
        if (normalized(queryElement.value) !== normalized(searchText))
          nativeQueryValue(queryElement, searchText, surfaceGuard);
        if (normalized(queryElement.value) !== normalized(searchText))
          throw new SearchFailure("search_query_conflict");
        if (!submit && lockedSubmit) {
          const expected = lockedSubmit;
          // Only the same button, now unlocked by the typed query, may run it.
          submit = await session.wait(() => {
            surfaceGuard();
            const live = submitControls(currentSurface);
            return live.length === 1 && live[0] === expected
              ? expected
              : undefined;
          }, "search_submit_not_found");
          nativeFormBinding = searchDestination(
            currentSurface,
            queryElement,
            submit,
          );
        }
        if (submit) {
          await session.prepareMutation();
          surfaceGuard();
          if (
            (submitRole ? !submitRole.current() : !submit.isConnected) ||
            !queryRole!.current() ||
            normalized(queryElement.value) !== normalized(searchText)
          )
            throw new SearchFailure("surface_stale");
          if (nativeFormBinding) {
            if (!nativeFormBinding.current())
              throw new SearchFailure("surface_stale");
            const destination = new URL(nativeFormBinding.destination);
            if (nativeFormBinding.method === "get") {
              destination.search = "";
              for (const [name, value] of nativeFormBinding.hiddenValues) {
                destination.searchParams.append(name, value);
              }
              destination.searchParams.append(
                nativeFormBinding.queryName,
                searchText,
              );
            }
            currentSurface.expectNavigation(
              destination,
              searchText,
              nativeFormBinding.method,
            );
          }
          trace(
            "검색 실행 버튼 클릭",
            nativeFormBinding
              ? {
                  method: nativeFormBinding.method,
                  destination: nativeFormBinding.destination,
                }
              : submit,
          );
          if (!nativeFormBinding) {
            if (isIconSearchSubmit(submit)) clickSubmitHandledByPage(submit);
            else clickWithoutFormSubmit(submit);
          } else submit.click();
          if (nativeFormBinding) {
            await session.wait(
              () => currentSurface.settleNavigation() || undefined,
              "surface_navigation_unsafe",
            );
          }
        }
      }
      try {
        candidate = await session.wait(() => {
          surfaceGuard();
          if (
            query?.isConnected &&
            normalized(query.value) !== normalized(searchText)
          )
            throw new SearchFailure("search_query_conflict");
          return querylessRegion
            ? regionListSelection(
                currentSurface,
                canonicalFieldKey,
                attemptValues,
              )
            : results.exact(attemptValues, catalogMatch);
        }, "result_pending");
        selectedSearchText = searchText;
        trace("일치 결과 발견", candidate?.element);
        break;
      } catch (error) {
        // Only an empty or still-pending result list defers to the query the
        // page mirrored into the target; an ambiguous result set stays held.
        if (
          error instanceof SearchFailure &&
          ["search_results_not_found", "result_pending"].includes(
            error.reason,
          ) &&
          reflectedByQuery()
        ) {
          candidate = undefined;
          break;
        }
        if (error instanceof SearchFailure)
          localWorkflowLog("search-result-wait", {
            reason: error.reason,
            pending: results.pendingReason(),
            roots: currentSurface.resultRoots().length,
          });
        if (
          error instanceof SearchFailure &&
          ["search_results_not_found", "result_set_incomplete"].includes(
            error.reason,
          ) &&
          !querylessRegion &&
          currentSurface
            .resultRoots()
            .some(
              (root) =>
                elements<HTMLElement>(
                  root,
                  "div[onclick], li[onclick], span[onclick], [onkeydown], [onkeyup]",
                ).length > 0 ||
                elements<HTMLElement>(root, "button, a, [role='option']").some(
                  (e) =>
                    /^(선택|확인|select|choose|confirm)$/i.test(
                      normalized(e.textContent ?? ""),
                    ),
                ),
            )
        ) {
          surfaceGuard();
          structuredResults = await results.interpret();
          surfaceGuard();
          candidate = structuredResults.exact(attemptValues, catalogMatch);
          selectedSearchText = searchText;
          break;
        }
        if (
          error instanceof SearchFailure &&
          error.reason === "search_results_not_found" &&
          attemptIndex + 1 < attempts.length &&
          (nativeFormBinding || query?.isConnected)
        ) {
          if (nativeFormBinding) {
            surfaceGuard();
            const refreshedQueries = queryControls(
              currentSurface,
              args.genericPopupRecovery === true,
            );
            const refreshedSubmits = submitControls(currentSurface);
            if (refreshedQueries.length !== 1 || refreshedSubmits.length !== 1)
              throw error;
            [queryRole, submitRole] = await resolveRoles(
              session,
              [
                {
                  role: "SEARCH_QUERY_INPUT",
                  collect: () =>
                    queryControls(
                      currentSurface,
                      args.genericPopupRecovery === true,
                    ),
                  scope: currentSurface.container,
                },
                {
                  role: "SEARCH_SUBMIT",
                  collect: () => submitControls(currentSurface),
                  scope: currentSurface.container,
                },
              ],
              { deterministicRebind: true },
            );
            query = queryRole!.binding.element as HTMLInputElement;
            const reboundSubmit = submitRole!.binding.element as
              HTMLButtonElement | HTMLInputElement;
            submit = reboundSubmit;
            nativeFormBinding = searchDestination(
              currentSurface,
              query,
              reboundSubmit,
            );
            if (!nativeFormBinding) throw error;
          }
          continue;
        }
        if (
          args.genericPopupRecovery &&
          catalogMatch &&
          error instanceof SearchFailure &&
          error.reason === "search_results_not_found" &&
          attemptIndex + 1 === attempts.length &&
          results.empty()
        ) {
          const buttons = () =>
            elements<HTMLButtonElement | HTMLInputElement>(
              currentSurface.root,
              "button, input[type=button]",
            ).filter(
              (control) => control.type === "button" && interactive(control),
            );
          const label = (control: HTMLButtonElement | HTMLInputElement) =>
            normalized(
              control instanceof HTMLInputElement
                ? control.value
                : (control.textContent ?? ""),
            );
          const directButtons = buttons().filter((control) =>
            /^(직접\s*입력|manual entry|enter manually)$/i.test(label(control)),
          );
          if (directButtons.length !== 1) throw error;
          const directButton = directButtons[0]!;
          const priorInputs = new Set(
            elements<HTMLInputElement>(currentSurface.root, "input").filter(
              interactive,
            ),
          );
          const priorButtons = new Set(buttons());
          const binding = bindSelectionEffects(
            identity,
            directButton,
            [expectedValue],
            currentSurface,
            true,
          );
          followUpObservation = captureSearchFollowUp(
            binding.scope,
            identity.target,
            true,
          );
          await session.prepareMutation();
          surfaceGuard();
          selectionStarted = true;
          clickWithoutFormSubmit(directButton);
          const manual = await session.wait(() => {
            surfaceGuard();
            const inputs = elements<HTMLInputElement>(
              currentSurface.root,
              "input:not([type]), input[type=text], input[type=search]",
            ).filter(
              (input) =>
                !priorInputs.has(input) &&
                interactive(input) &&
                !input.readOnly,
            );
            if (inputs.length > 1)
              throw new SearchFailure("multiple_search_query_inputs");
            return inputs[0];
          }, "unverified_search_form");
          await session.prepareMutation();
          surfaceGuard();
          nativeQueryValue(manual, expectedValue, surfaceGuard);
          const confirmations = buttons().filter(
            (control) =>
              !priorButtons.has(control) &&
              /^(확인|적용|confirm|apply)$/i.test(label(control)),
          );
          if (confirmations.length !== 1)
            throw new SearchFailure("unverified_search_form");
          const confirmation = confirmations[0]!;
          candidate = {
            element: confirmation,
            signature: controlSignature(confirmation),
            evidence: { label: expectedValue },
          };
          directEntry = { input: manual, binding };
          selectedSearchText = expectedValue;
          break;
        }
        throw error;
      }
    }
    // Accept a query-bound value only when no result row matched and the value
    // survives closing the surface.
    if (!candidate && reflectedByQuery()) {
      selectionStarted = true;
      effect = "value-observed";
      if (await closeOwnedSurface(currentSurface, false))
        throw new SearchFailure("popup_unresolved");
      let retainedSince: number | undefined;
      await session.wait(() => {
        guard(matchingValues);
        retainedSince ??= performance.now();
        return performance.now() - retainedSince >= 500 ? true : undefined;
      }, "result_not_reflected");
      trace("검색어 반영으로 선택 완료", {
        targetValue: identity.target.value,
      });
      const reflectedIdentity = identity;
      return {
        status: "selected",
        targetCandidateId,
        identity,
        effect,
        ...(catalogMatch
          ? {
              selectedValue: expectedValue,
              catalogSelection: {
                evidence: { label: expectedValue },
                verify: () =>
                  reflectedIdentity.target.value === expectedValue &&
                  JSON.stringify(args.catalogMatch) === approvedCatalog &&
                  typeof targetIsCurrent(
                    document,
                    registry,
                    targetCandidateId,
                    reflectedIdentity,
                    args.assertCurrent,
                    [expectedValue],
                  ) !== "string" &&
                  currentSurface.closure() === "closed",
              },
            }
          : {}),
      };
    }
    if (!candidate) throw new SearchFailure("search_results_not_found");
    const selectedValues = catalogMatch
      ? [candidate.evidence!.label]
      : args.searchValues
        ? [selectedSearchText]
        : values;
    const activationScope = () => {
      const resultRoot = currentSurface
        .resultRoots()
        .find((root) => root.contains(candidate.element));
      return resultRoot
        ? {
            resultRoot,
            surfaceKind: currentSurface.kind,
            allowEmptyJavascriptLink: args.genericPopupRecovery === true,
          }
        : undefined;
    };
    await session.prepareMutation();
    surfaceGuard();
    const latest = directEntry
      ? candidate
      : querylessRegion
        ? regionListSelection(currentSurface, canonicalFieldKey, selectedValues)
        : structuredResults
          ? structuredResults.exact(selectedValues, catalogMatch)
          : selectedResults?.exact(selectedValues, catalogMatch);
    if (
      !latest ||
      latest.element !== candidate.element ||
      latest.signature !== candidate.signature ||
      !(directEntry
        ? directEntry.input.isConnected &&
          currentSurface.contains(directEntry.input) &&
          interactive(directEntry.input) &&
          !directEntry.input.readOnly &&
          directEntry.input.value === expectedValue &&
          interactive(candidate.element) &&
          controlSignature(candidate.element) === candidate.signature
        : structuredResults
          ? resultActivation(candidate.element) !== "none"
          : safeActivation(
              candidate.element,
              selectedValues,
              activationScope(),
            ))
    )
      throw new SearchFailure("result_stale");
    const structuredMatch = structuredResults?.exact(
      selectedValues,
      catalogMatch,
    );
    const structuredEffects = structuredMatch
      ? bindStructuredEffects(
          identity,
          structuredMatch.row,
          candidate.element,
          currentSurface,
          session,
        )
      : undefined;
    const selectionBinding =
      directEntry?.binding ??
      (!structuredResults &&
      (catalogMatch || canonicalFieldKey.startsWith("certifications."))
        ? bindSelectionEffects(
            identity,
            candidate.element,
            selectedValues,
            currentSurface,
            args.genericPopupRecovery === true,
          )
        : undefined);
    followUpObservation ??= selectionBinding
      ? captureSearchFollowUp(
          selectionBinding.scope,
          identity.target,
          args.genericPopupRecovery === true,
        )
      : undefined;
    // Only a local confirmation observed disabled before the verified result
    // click can become eligible. Never interpret an application save/submit
    // control as part of this optional generic selection step.
    const confirmations = () =>
      elements<HTMLButtonElement>(currentSurface.root, "button").filter(
        (button) => {
          // shown() also rejects disabled controls; inspect visibility separately
          // so the pre-selection disabled state can be bound without changing it.
          const style =
            button.ownerDocument.defaultView?.getComputedStyle(button);
          return (
            button.isConnected &&
            !button.hidden &&
            button.parentElement &&
            shown(button.parentElement) &&
            style?.display !== "none" &&
            style?.visibility !== "hidden" &&
            /^(등록|확인|적용|confirm|apply)$/i.test(label(button)) &&
            !currentSurface.resultRoots().some((root) => root.contains(button))
          );
        },
      );
    const beforeConfirmations =
      args.genericPopupRecovery === true &&
      !directEntry &&
      !structuredResults &&
      currentSurface.kind.startsWith("same-document-")
        ? confirmations()
        : [];
    const confirmation =
      beforeConfirmations.length === 1 &&
      beforeConfirmations[0]!.disabled &&
      beforeConfirmations[0]!.type === "button"
        ? beforeConfirmations[0]
        : undefined;
    const confirmationSignature = confirmation
      ? controlSignature(confirmation)
      : undefined;
    trace("결과 선택 클릭", candidate.element);
    selectionStarted = true;
    const resultLink =
      candidate.element.tagName === "A"
        ? (candidate.element as HTMLAnchorElement)
        : candidate.element.querySelector<HTMLAnchorElement>("a[href]");
    if (
      resultLink &&
      /^javascript:/i.test(resultLink.getAttribute("href") ?? "") &&
      !(
        args.genericPopupRecovery === true &&
        /^javascript:\s*;?$/i.test(
          resultLink.getAttribute("href")?.trim() ?? "",
        )
      )
    ) {
      if (!(await clickVerifiedJsResult(resultLink, session)))
        throw new SearchFailure("result_activation_unsafe");
    } else {
      const href = resultLink?.getAttribute("href")?.trim() ?? "";
      if (resultLink && href.length > 1 && href.startsWith("#"))
        allowedFragmentUrl = new URL(href, document.URL).href;
      clickWithoutFormSubmit(candidate.element);
    }
    if (confirmation && currentSurface.closure() === "open") {
      await session.wait(() => {
        surfaceGuard();
        const current = confirmations();
        if (
          current.length !== 1 ||
          current[0] !== confirmation ||
          confirmation.type !== "button" ||
          controlSignature(confirmation) !== confirmationSignature
        )
          throw new SearchFailure("result_stale");
        return interactive(confirmation) ? true : undefined;
      }, "popup_unresolved");
      await session.prepareMutation();
      surfaceGuard();
      if (
        confirmations().length !== 1 ||
        confirmations()[0] !== confirmation ||
        confirmation.type !== "button" ||
        !interactive(confirmation) ||
        controlSignature(confirmation) !== confirmationSignature
      )
        throw new SearchFailure("result_stale");
      clickWithoutFormSubmit(confirmation);
    }
    let retainedSince: number | undefined;
    await session.wait(() => {
      const reflected = guard();
      observation.assertOwned(currentSurface);
      currentSurface.assertSelectionDocument();
      const reflectedValue = catalogMatch
        ? reflected.value === selectedValues[0]
        : selectedValues.some(
            (value) => normalized(value) === normalized(reflected.value),
          );
      if (reflectedValue) effect = "value-observed";
      const effectsVerified = structuredEffects?.verify();
      if (
        reflectedValue &&
        (structuredEffects
          ? effectsVerified
          : currentSurface.closure() === "closed")
      ) {
        if (selectionBinding) verifySelectionEffects(selectionBinding);
        retainedSince ??= performance.now();
        if (performance.now() - retainedSince >= 500) return true;
      } else {
        if (retainedSince !== undefined)
          throw new SearchFailure("result_not_reflected");
      }
      return undefined;
    }, "popup_unresolved");
    const followUpControls = followUpObservation
      ? await followUpObservation.wait({
          signal: args.signal,
          assertCurrent: () => {
            session.check();
            return true;
          },
          verify: () => verifySelectionEffects(selectionBinding!),
        })
      : [];
    await session.prepareMutation();
    guard(selectedValues);
    if (selectionBinding) verifySelectionEffects(selectionBinding);
    if (catalogMatch && identity.target.value !== candidate.evidence!.label)
      throw new SearchFailure("result_not_reflected");
    if (structuredEffects && !structuredEffects.verify())
      throw new SearchFailure("selection_postcondition_failed");
    trace("선택 완료", {
      selectedSearchText,
      targetValue: identity.target.value,
      followUpControls: followUpControls.length,
    });
    const retainedRelationValue = selectionBinding?.relation?.element.value;
    return {
      status: "selected",
      targetCandidateId,
      identity,
      effect,
      ...(catalogMatch
        ? {
            selectedValue: candidate.evidence!.label,
            catalogSelection: {
              evidence: candidate.evidence!,
              verify: () => {
                try {
                  if (
                    identity!.target.value !== candidate!.evidence!.label ||
                    JSON.stringify(args.catalogMatch) !== approvedCatalog
                  )
                    return false;
                  const current = targetIsCurrent(
                    document,
                    registry,
                    targetCandidateId,
                    identity!,
                    args.assertCurrent,
                    selectedValues,
                  );
                  if (typeof current === "string") return false;
                  if (selectionBinding && args.genericPopupRecovery !== true)
                    verifySelectionEffects(selectionBinding);
                  else if (selectionBinding) {
                    if (
                      selectionBinding.relation?.element.value !==
                      retainedRelationValue
                    )
                      return false;
                    verifyRetainedSelectionEffects(selectionBinding);
                  }
                  return structuredEffects
                    ? structuredEffects.verify()
                    : currentSurface.closure() === "closed";
                } catch (error) {
                  if (error instanceof SearchFailure) return false;
                  throw error;
                }
              },
            },
          }
        : args.searchValues
          ? { selectedValue: selectedSearchText }
          : {}),
      ...(followUpControls.length
        ? { followUp: { controls: followUpControls } }
        : {}),
    };
  } catch (error) {
    const reason =
      error instanceof SearchFailure ? error.reason : "execution_failed";
    debugSearchFailure(targetCandidateId, step, reason, effect, error);
    const leftOpenReason = surface
      ? await closeOwnedSurface(
          surface,
          args.genericPopupRecovery === true && !selectionStarted,
        )
      : modalsBeforeOpener
        ? await closeModalOpenedBy(modalsBeforeOpener, document)
        : undefined;
    return {
      status: effect === "none" ? "unsupported" : "failed",
      targetCandidateId,
      effect,
      reason,
      ...(leftOpenReason
        ? {
            surfaceLeftOpen: true as const,
            surfaceLeftOpenReason: leftOpenReason,
          }
        : {}),
    };
  } finally {
    followUpObservation?.dispose();
    session.stop();
    activeTransactions.delete(document);
  }
}
