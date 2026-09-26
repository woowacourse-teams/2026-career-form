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
  type TargetIdentity,
} from "./readonly-search";
import { SearchFailure, SearchSession } from "./search-session";
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
} from "./search-controls";
import { observeResults, resultBaseline } from "./search-results";
import {
  bindSelectionEffects,
  verifySelectionEffects,
} from "./search-selection-effects";
import { captureSearchFollowUp } from "./search-follow-up";
import { interactive, elements, safeActivation } from "./search-surface-dom";
import type { SearchSurface } from "./search-surface";
import {
  isCjMajorCandidate,
  isCjMajorTarget,
  validateCjMajorPreflight,
} from "./cj-major-contract";
import {
  prepareCjMajorClose,
  prepareCjSchoolClose,
} from "./cj-major-close-bridge";
import {
  isCjSchoolCandidate,
  isCjSchoolTarget,
  validateCjSchoolRow,
} from "./cj-school-contract";
import { executeCjSchoolSearch } from "./cj-school-search";
import { executeCjMajorSearch } from "./cj-major-search";

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
  const session = new SearchSession(args);
  const outerUrl = document.URL;
  let effect: SearchEffect = "none";
  let identity: TargetIdentity | undefined;
  let surface: SearchSurface | undefined;
  let followUpObservation: ReturnType<typeof captureSearchFollowUp>;
  try {
    session.check();
    if (
      !isAutofillProfileFieldKey(canonicalFieldKey) ||
      !normalized(expectedValue)
    )
      throw new SearchFailure("field_not_readonly");
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
    const matchingValues = args.searchValues ? attempts : values;
    const matches = (value: string) =>
      matchingValues.some(
        (candidate) => normalized(candidate) === normalized(value),
      );
    const guard = (expected?: string | readonly string[]) => {
      session.check();
      if (document.URL !== outerUrl)
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
    const schoolCandidate = isCjSchoolCandidate(
      document,
      canonicalFieldKey,
      identity,
    );
    if (schoolCandidate)
      validateCjSchoolRow(
        target,
        initialValue === expectedValue ? expectedValue : undefined,
      );
    if (normalized(initialValue) && !schoolCandidate) {
      if (!matches(initialValue))
        throw new SearchFailure("existing_value_conflict");
      await session.prepareMutation();
      guard(values);
      return { status: "unchanged", targetCandidateId, identity, effect };
    }
    const [openerRole] = await resolveRoles(session, [
      {
        role: "SEARCH_POPUP_OPENER",
        scope: identity.fieldGroup,
        collect: () =>
          searchOpeners(identity!.fieldGroup).filter(safeSearchOpener),
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
      !safeSearchOpener(opener) ||
      !interactive(opener)
    )
      throw new SearchFailure("stale_field_group");
    const cjCandidate = isCjMajorCandidate(
      document,
      canonicalFieldKey,
      identity,
    );
    const cjMajor =
      cjCandidate &&
      isCjMajorTarget(document, canonicalFieldKey, identity, opener);
    const cjSchool =
      schoolCandidate &&
      isCjSchoolTarget(document, canonicalFieldKey, identity, opener);
    if ((cjCandidate && !cjMajor) || (schoolCandidate && !cjSchool))
      throw new SearchFailure("unverified_search_form");
    if (cjMajor) validateCjMajorPreflight(identity);
    if (cjSchool)
      validateCjSchoolRow(
        target,
        initialValue === expectedValue ? expectedValue : undefined,
      );
    const cjLease = cjMajor
      ? await prepareCjMajorClose(opener, session)
      : cjSchool
        ? await prepareCjSchoolClose(opener, session)
        : undefined;
    guard(initialValue);
    if (cjLease) {
      if (
        !openerRole!.current() ||
        !safeSearchOpener(opener) ||
        !interactive(opener) ||
        !(cjMajor
          ? isCjMajorTarget(document, canonicalFieldKey, identity, opener)
          : isCjSchoolTarget(document, canonicalFieldKey, identity, opener))
      )
        throw new SearchFailure("unverified_search_form");
      if (cjMajor) validateCjMajorPreflight(identity);
      else
        validateCjSchoolRow(
          target,
          initialValue === expectedValue ? expectedValue : undefined,
        );
    }
    effect = "interaction-started";
    opener.click();
    surface = await session.wait(
      () => observation.discover(opener),
      "surface_not_found",
    );
    // Capture settled opener metadata once its attributed surface has appeared.
    identity.openerSignature = controlSignature(opener);
    identity.openerSignatures = identity.openers.map(controlSignature);
    const currentSurface = surface;
    const regionList = () =>
      completeRegionList(currentSurface, canonicalFieldKey);
    const surfaceGuard = () => {
      guard(initialValue);
      observation.assertOwned(currentSurface);
      currentSurface.revalidate();
      validateRegionContext(args, currentSurface);
    };
    surfaceGuard();
    if (cjLease) {
      const runCj = cjMajor ? executeCjMajorSearch : executeCjSchoolSearch;
      const cjResult = await runCj(
        currentSurface,
        session,
        cjLease,
        expectedValue,
        (allowed) => guard(allowed),
        () => observation.assertOwned(currentSurface),
        () => {
          effect = "value-observed";
        },
      );
      return {
        status: cjResult === "unchanged" ? "unchanged" : "selected",
        targetCandidateId,
        identity,
        effect,
      };
    }
    const controls = await session.wait(() => {
      surfaceGuard();
      const queries = queryControls(currentSurface);
      const submits = submitControls(currentSurface);
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
    if (queries.length) {
      const roleRequests = [
        {
          role: "SEARCH_QUERY_INPUT" as const,
          collect: () => queryControls(currentSurface),
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
      if (!submit && !queryOnly(currentSurface, query))
        throw new SearchFailure("search_submit_not_found");
    } else if (
      submits.length ||
      (!currentSurface.resultRoots().length && !regionList())
    ) {
      throw new SearchFailure("search_query_not_found");
    }
    const querylessRegion = !query && Boolean(regionList());
    currentSurface.mode = query
      ? submit
        ? "query-and-submit"
        : "query-only"
      : "existing-options";
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
    let candidate: { element: HTMLElement; signature: string } | undefined;
    let selectedResults: ReturnType<typeof observeResults> | undefined;
    let selectedSearchText = initialSearchText;
    for (const [attemptIndex, searchText] of attempts.entries()) {
      const attemptValues = args.searchValues ? [searchText] : values;
      const baseline = resultBaseline(currentSurface);
      if (baseline.some((entry) => entry.busy === "true"))
        throw new SearchFailure("result_pending");
      currentSurface.queryGeneration++;
      const results = observeResults(
        currentSurface,
        session,
        baseline,
        query ? searchText : undefined,
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
        if (submit) {
          await session.prepareMutation();
          surfaceGuard();
          if (
            !submitRole!.current() ||
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
          submit.click();
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
            : results.exact(attemptValues);
        }, "result_pending");
        selectedSearchText = searchText;
        break;
      } catch (error) {
        if (
          error instanceof SearchFailure &&
          error.reason === "search_results_not_found" &&
          attemptIndex + 1 < attempts.length &&
          (nativeFormBinding || query?.isConnected)
        ) {
          if (nativeFormBinding) {
            surfaceGuard();
            const refreshedQueries = queryControls(currentSurface);
            const refreshedSubmits = submitControls(currentSurface);
            if (refreshedQueries.length !== 1 || refreshedSubmits.length !== 1)
              throw error;
            [queryRole, submitRole] = await resolveRoles(
              session,
              [
                {
                  role: "SEARCH_QUERY_INPUT",
                  collect: () => queryControls(currentSurface),
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
        throw error;
      }
    }
    if (!candidate) throw new SearchFailure("search_results_not_found");
    const selectedValues = args.searchValues ? [selectedSearchText] : values;
    await session.prepareMutation();
    surfaceGuard();
    const latest = querylessRegion
      ? regionListSelection(currentSurface, canonicalFieldKey, selectedValues)
      : selectedResults?.exact(selectedValues);
    if (
      !latest ||
      latest.element !== candidate.element ||
      latest.signature !== candidate.signature ||
      !safeActivation(candidate.element, selectedValues)
    )
      throw new SearchFailure("result_stale");
    const selectionBinding = canonicalFieldKey.startsWith("certifications.")
      ? bindSelectionEffects(identity, candidate.element, selectedValues)
      : undefined;
    followUpObservation = selectionBinding
      ? captureSearchFollowUp(selectionBinding.scope, identity.target)
      : undefined;
    const resultLink =
      candidate.element.tagName === "A"
        ? (candidate.element as HTMLAnchorElement)
        : candidate.element.querySelector<HTMLAnchorElement>("a[href]");
    if (
      resultLink &&
      /^javascript:/i.test(resultLink.getAttribute("href") ?? "")
    ) {
      if (!(await clickVerifiedJsResult(resultLink, session)))
        throw new SearchFailure("result_activation_unsafe");
    } else {
      candidate.element.click();
    }
    let retainedSince: number | undefined;
    await session.wait(() => {
      const reflected = guard();
      observation.assertOwned(currentSurface);
      currentSurface.assertSelectionDocument();
      const reflectedValue = selectedValues.some(
        (value) => normalized(value) === normalized(reflected.value),
      );
      if (reflectedValue) effect = "value-observed";
      if (reflectedValue && currentSurface.closure() === "closed") {
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
    return {
      status: "selected",
      targetCandidateId,
      identity,
      effect,
      ...(args.searchValues ? { selectedValue: selectedSearchText } : {}),
      ...(followUpControls.length
        ? { followUp: { controls: followUpControls } }
        : {}),
    };
  } catch (error) {
    return {
      status: effect === "none" ? "unsupported" : "failed",
      targetCandidateId,
      effect,
      reason:
        error instanceof SearchFailure ? error.reason : "execution_failed",
    };
  } finally {
    followUpObservation?.dispose();
    session.stop();
    activeTransactions.delete(document);
  }
}
