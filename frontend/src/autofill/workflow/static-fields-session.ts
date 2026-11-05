import { componentSelector } from "../policy/component-dom";
import type {
  AnalysisApiClient,
  FieldAnalysis,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
} from "../api/types";
import { CandidateRegistry } from "../dom/candidate-registry";
import type { CollectedSnapshot } from "../dom/collect";
import type { FieldCandidateHandle } from "../dom/types";

export type AnalyzeFieldsSnapshot = (
  snapshot: CollectedSnapshot<FieldsAnalyzeRequest>,
) => Promise<FieldsAnalyzeResponse>;

export interface StaticFieldsSession extends AnalyzeFieldsSnapshot {
  refreshAfterPass(
    snapshot: CollectedSnapshot<FieldsAnalyzeRequest>,
    eligible?: (
      handle: FieldCandidateHandle,
      previous?: FieldAnalysis,
    ) => boolean,
  ): Promise<boolean>;
}

function identity(handle: FieldCandidateHandle): string {
  const { candidateId: _candidateId, options, ...candidate } = handle.candidate;
  return JSON.stringify([
    handle.sectionId,
    handle.itemGroupId,
    handle.itemId,
    handle.itemIndex,
    candidate,
    options?.map((option) => option.displayName),
  ]);
}

/** Per-pass index: duplicate identities remain ambiguous, never first-match wins. */
function groupByIdentity<T>(items: Iterable<T>, key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const id = key(item);
    const group = groups.get(id);
    if (group) group.push(item);
    else groups.set(id, [item]);
  }
  return groups;
}

function targets(handle: FieldCandidateHandle): Element[] {
  return [...handle.elements, ...(handle.customElements ?? [])];
}

interface OriginalField {
  identity: string;
  elements: Element[];
  candidateId: string;
  displayName?: string;
  row?: Element;
  rowContainer?: Element | null;
}

function captureField(handle: FieldCandidateHandle): OriginalField {
  const elements = targets(handle);
  const row =
    handle.itemGroupId === undefined
      ? undefined
      : (elements[0]?.closest(componentSelector(elements[0], "row")) ??
        undefined);
  return {
    identity: identity(handle),
    elements,
    candidateId: handle.candidateId,
    ...(handle.candidate.displayName
      ? { displayName: handle.candidate.displayName }
      : {}),
    row,
    rowContainer: row?.parentElement,
  };
}

function componentRowMatches(
  previous: OriginalField,
  handle: FieldCandidateHandle,
): boolean {
  if (handle.itemGroupId === undefined) return !previous.row;
  const row = targets(handle)[0]?.closest(
    componentSelector(targets(handle)[0], "row"),
  );
  return (
    !!previous.row &&
    (previous.row.isConnected
      ? row === previous.row
      : !!previous.rowContainer?.isConnected &&
        row?.parentElement === previous.rowContainer)
  );
}

function snapshotHandles(
  snapshot: CollectedSnapshot<FieldsAnalyzeRequest>,
): FieldCandidateHandle[] {
  return snapshot.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items ?? []).flatMap((item) => item.fields),
    ])
    .flatMap((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return lookup.status === "ready" || lookup.status === "blocked"
        ? [lookup.handle]
        : [];
    });
}

/** Rebind only unique, unchanged Component forms fields; changed fields stay unavailable. */
export function captureComponentWriteRegistry(
  snapshot: CollectedSnapshot<FieldsAnalyzeRequest>,
) {
  const originals = snapshotHandles(snapshot).map(captureField);
  const originalGroups = groupByIdentity(originals, (field) => field.identity);
  return (next: CollectedSnapshot<FieldsAnalyzeRequest>): CandidateRegistry => {
    const registry = new CandidateRegistry();
    if (
      JSON.stringify(snapshot.request.site) !==
      JSON.stringify(next.request.site)
    )
      return registry;
    const handles = snapshotHandles(next);
    const handleGroups = groupByIdentity(handles, identity);
    for (const previous of originals) {
      if (originalGroups.get(previous.identity)?.length !== 1) continue;
      const matches = handleGroups.get(previous.identity) ?? [];
      if (
        matches.length !== 1 ||
        !matches[0]!.candidate.domName ||
        !componentRowMatches(previous, matches[0]!)
      )
        continue;
      const handle = matches[0]!;
      const lookup = next.registry.lookupField(handle.candidateId);
      if (lookup.status !== "ready" && lookup.status !== "blocked") continue;
      registry.registerField(
        {
          ...handle,
          candidateId: previous.candidateId,
          candidate: { ...handle.candidate, candidateId: previous.candidateId },
        },
        lookup.status === "blocked" ? lookup.reason : undefined,
      );
      const rowCount = next.registry.fieldItemCount(handle.candidateId);
      if (rowCount !== undefined)
        registry.setFieldItemCount(
          handle.sectionId,
          rowCount,
          handle.itemGroupId,
        );
    }
    return registry;
  };
}

/** Reuse mapping during a write pass; refresh only at the end of the pass. */
export function createStaticFieldsSession(
  client: AnalysisApiClient,
  options: { rebindComponentElements?: boolean } = {},
): StaticFieldsSession {
  let initial: Promise<FieldsAnalyzeResponse> | undefined;
  let site: string;
  const deferredRows = new Set<string>();
  const rowKey = (handle: FieldCandidateHandle) =>
    handle.itemId === undefined
      ? undefined
      : JSON.stringify([handle.sectionId, handle.itemGroupId, handle.itemId]);
  const originals = new Map<Element, OriginalField>();
  const previousField = (
    handle: FieldCandidateHandle,
    handleGroups: Map<string, FieldCandidateHandle[]>,
    originalGroups: Map<string, OriginalField[]>,
  ) => {
    const exact = targets(handle)[0];
    if (!options.rebindComponentElements)
      return exact ? originals.get(exact) : undefined;
    const key = identity(handle);
    if (!handle.candidate.domName || handleGroups.get(key)?.length !== 1)
      return undefined;
    const matches = originalGroups.get(key) ?? [];
    return matches.length === 1 && componentRowMatches(matches[0]!, handle)
      ? matches[0]
      : undefined;
  };
  const sameTargets = (previous: OriginalField, elements: Element[]) =>
    options.rebindComponentElements ||
    (previous.elements.length === elements.length &&
      previous.elements.every((element, index) => element === elements[index]));
  const refreshedStructures = new Set<string>();
  const analyze: AnalyzeFieldsSnapshot = async (snapshot) => {
    const fields = snapshot.request.sections.flatMap((section) => [
      ...section.fields,
      ...(section.items ?? []).flatMap((item) => item.fields),
    ]);
    if (!initial) {
      originals.clear();
      deferredRows.clear();
      site = JSON.stringify(snapshot.request.site);
      for (const field of fields) {
        const lookup = snapshot.registry.lookupField(field.candidateId);
        if (lookup.status !== "ready" && lookup.status !== "blocked") continue;
        const elements = targets(lookup.handle);
        if (elements[0])
          originals.set(elements[0], captureField(lookup.handle));
      }
      initial = Promise.resolve().then(() =>
        client.analyzeFields(snapshot.request),
      );
      return initial;
    }
    const response = await initial;
    const handles = snapshotHandles(snapshot);
    const handleGroups = groupByIdentity(handles, identity);
    const originalGroups = groupByIdentity(
      originals.values(),
      (field) => field.identity,
    );
    const lookups = new Map<
      string,
      ReturnType<CandidateRegistry["lookupField"]>
    >();
    const lookupField = (id: string) => {
      let result = lookups.get(id);
      if (!result) {
        result = snapshot.registry.lookupField(id);
        lookups.set(id, result);
      }
      return result;
    };
    let deferred = false;
    const responseById = new Map(
      response.fields.map((field) => [field.candidateId, field]),
    );
    // Server matches that found a home in this snapshot; the rest are reported.
    const reboundSources = new Set<string>();
    const rebound = fields.map((field): FieldAnalysis => {
      const lookup = lookupField(field.candidateId);
      if (
        response.mode === "ADAPTER" &&
        JSON.stringify(snapshot.request.site) === site &&
        (lookup.status === "ready" || lookup.status === "blocked")
      ) {
        const elements = targets(lookup.handle);
        const previous = previousField(
          lookup.handle,
          handleGroups,
          originalGroups,
        );
        const source = previous && responseById.get(previous.candidateId);
        const row = rowKey(lookup.handle);
        if (
          !options.rebindComponentElements &&
          row &&
          previous &&
          source?.matchType === "MATCH" &&
          source.autofillPolicy === "CONDITIONAL" &&
          previous.identity !== identity(lookup.handle)
        )
          deferredRows.add(row);
        if (
          previous &&
          previous.identity === identity(lookup.handle) &&
          sameTargets(previous, elements)
        ) {
          const matches = response.fields.filter(
            (item) => item.candidateId === previous.candidateId,
          );
          if (matches.length === 1) {
            reboundSources.add(previous.candidateId);
            return { ...matches[0]!, candidateId: field.candidateId };
          }
        }
      }
      deferred = true;
      return {
        candidateId: field.candidateId,
        matchType: "NO_MATCH",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "BLOCKED",
        reasonCodes: ["NO_MATCH"],
      };
    });
    const labelsById = new Map(
      [...originals.values()].map((field) => [
        field.candidateId,
        field.displayName,
      ]),
    );
    const unresolvedFields = response.fields
      .filter(
        (field) =>
          field.matchType === "MATCH" && !reboundSources.has(field.candidateId),
      )
      .map((field) => ({
        candidateId: field.candidateId,
        ...(labelsById.get(field.candidateId)
          ? { displayName: labelsById.get(field.candidateId) }
          : {}),
      }));
    return {
      ...response,
      snapshotId: snapshot.request.snapshotId,
      ...(unresolvedFields.length ? { unresolvedFields } : {}),
      fields: rebound.map((field) => {
        const lookup = lookupField(field.candidateId);
        const row =
          (lookup.status === "ready" || lookup.status === "blocked") &&
          rowKey(lookup.handle);
        if (!row || !deferredRows.has(row)) return field;
        deferred = true;
        return {
          candidateId: field.candidateId,
          matchType: "NO_MATCH",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "BLOCKED",
          reasonCodes: ["NO_MATCH"],
        };
      }),
      analysisStatus:
        response.analysisStatus === "BLOCKED"
          ? "BLOCKED"
          : deferred
            ? "PARTIAL"
            : response.analysisStatus,
      ...(deferred
        ? {
            warningCodes: [
              ...new Set([
                ...(response.warningCodes ?? []),
                "UNRESOLVED_FIELD" as const,
              ]),
            ],
          }
        : {}),
    };
  };
  const refreshAfterPass: StaticFieldsSession["refreshAfterPass"] = async (
    snapshot,
    eligible = () => true,
  ) => {
    if (!initial || JSON.stringify(snapshot.request.site) !== site)
      return false;
    const response = await initial;
    if (response.mode !== "ADAPTER" || response.analysisStatus === "BLOCKED")
      return false;
    const handles = snapshot.request.sections
      .flatMap((section) => [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ])
      .flatMap((field) => {
        const lookup = snapshot.registry.lookupField(field.candidateId);
        return lookup.status === "ready" || lookup.status === "blocked"
          ? [lookup.handle]
          : [];
      });
    const handleGroups = groupByIdentity(handles, identity);
    const originalGroups = groupByIdentity(
      originals.values(),
      (field) => field.identity,
    );
    const changed = handles.filter((handle) => {
      const field = handle.candidate;
      if (field.visibility !== "visible" || field.disabled || field.inert)
        return false;
      const elements = targets(handle);
      const previous = previousField(handle, handleGroups, originalGroups);
      if (
        previous &&
        previous.identity === identity(handle) &&
        sameTargets(previous, elements)
      )
        return false;
      return eligible(
        handle,
        previous
          ? response.fields.find(
              (field) => field.candidateId === previous.candidateId,
            )
          : undefined,
      );
    });
    if (!changed.length) return false;
    // A repeated semantic shape is no progress even when a page keeps replacing nodes.
    const signature = JSON.stringify(handles.map(identity));
    if (refreshedStructures.has(signature)) return false;
    refreshedStructures.add(signature);
    initial = undefined;
    await analyze(snapshot);
    return true;
  };
  return Object.assign(analyze, { refreshAfterPass });
}
