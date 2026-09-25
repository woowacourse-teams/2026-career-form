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
import { interactive, elements, safeActivation } from "./search-surface-dom";
import type { SearchSurface } from "./search-surface";
import {
  isCjMajorCandidate,
  isCjMajorTarget,
  validateCjMajorPreflight,
} from "./cj-major-contract";
import { prepareCjMajorClose } from "./cj-major-close-bridge";
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
    const matches = (value: string) =>
      values.some((candidate) => normalized(candidate) === normalized(value));
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
    if (normalized(initialValue)) {
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
    if (cjCandidate && !cjMajor)
      throw new SearchFailure("unverified_search_form");
    if (cjMajor) validateCjMajorPreflight(identity);
    const cjLease = cjMajor
      ? await prepareCjMajorClose(opener, session)
      : undefined;
    guard(initialValue);
    if (cjLease) {
      if (
        !openerRole!.current() ||
        !safeSearchOpener(opener) ||
        !interactive(opener) ||
        !isCjMajorTarget(document, canonicalFieldKey, identity, opener)
      )
        throw new SearchFailure("unverified_search_form");
      validateCjMajorPreflight(identity);
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
      await executeCjMajorSearch(
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
      return { status: "selected", targetCandidateId, identity, effect };
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
    const searchText = values[0]!;
    if (
      query &&
      normalized(query.value) &&
      normalized(query.value) !== normalized(searchText)
    )
      throw new SearchFailure("search_query_conflict");
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
    if (query) {
      const queryElement = query;
      if (submit) searchDestination(currentSurface, queryElement, submit);
      await session.prepareMutation();
      surfaceGuard();
      if (
        !queryRole!.current() ||
        !interactive(queryElement) ||
        queryElement.readOnly
      )
        throw new SearchFailure("surface_stale");
      if (!normalized(queryElement.value))
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
        const destination = searchDestination(
          currentSurface,
          queryElement,
          submit,
        );
        if (destination) {
          if (!queryElement.name)
            throw new SearchFailure("unverified_search_form");
          destination.search = "";
          destination.searchParams.set(queryElement.name, searchText);
          currentSurface.expectNavigation(destination);
        }
        submit.click();
        if (destination) {
          await session.wait(
            () => currentSurface.settleNavigation() || undefined,
            "surface_navigation_unsafe",
          );
        }
      }
    }
    const candidate = await session.wait(() => {
      surfaceGuard();
      if (
        query?.isConnected &&
        normalized(query.value) !== normalized(searchText)
      )
        throw new SearchFailure("search_query_conflict");
      return querylessRegion
        ? regionListSelection(currentSurface, canonicalFieldKey, values)
        : results.exact(values);
    }, "result_pending");
    await session.prepareMutation();
    surfaceGuard();
    const latest = querylessRegion
      ? regionListSelection(currentSurface, canonicalFieldKey, values)
      : results.exact(values);
    if (
      !latest ||
      latest.element !== candidate.element ||
      latest.signature !== candidate.signature ||
      !safeActivation(candidate.element, values)
    )
      throw new SearchFailure("result_stale");
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
      const reflectedValue = matches(reflected.value);
      if (reflectedValue) effect = "value-observed";
      if (reflectedValue && currentSurface.closure() === "closed") {
        retainedSince ??= performance.now();
        if (performance.now() - retainedSince >= 500) return true;
      } else {
        if (retainedSince !== undefined)
          throw new SearchFailure("result_not_reflected");
      }
      return undefined;
    }, "popup_unresolved");
    await session.prepareMutation();
    guard(values);
    return { status: "selected", targetCandidateId, identity, effect };
  } catch (error) {
    return {
      status: effect === "none" ? "unsupported" : "failed",
      targetCandidateId,
      effect,
      reason:
        error instanceof SearchFailure ? error.reason : "execution_failed",
    };
  } finally {
    session.stop();
    activeTransactions.delete(document);
  }
}
