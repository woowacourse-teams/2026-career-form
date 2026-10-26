import { normalizeStagedRoad } from "../policy/staged-address-road";
import { stagedAddressNodes } from "../policy/staged-address-dom";
import { runStagedAddress } from "../policy/staged-address";
import { executionPolicy } from "./execution-policy";
import { runKakaoAddress } from "../address/kakao-executor";
import { localWorkflowLog } from "../debug/local-workflow";
import type { Profile } from "../../profile/model";
import type { AddressSearch } from "../address/types";
import type { WorkflowAdapter } from "../adapters/workflow";
import type { FieldsAnalyzeResponse } from "../api/types";
import type { collectFieldsSnapshot } from "../dom/collect";
import type { WriteResultListener } from "../write/executor";
import { addressValue } from "./workflow-model";

type AddressRun = {
  controller: AbortController;
  button?: Element;
  task?: Promise<
    Awaited<ReturnType<NonNullable<WorkflowAdapter["runAddress"]>>>
  >;
};

export async function runAddressAnalysis({
  analysis,
  snapshot,
  adapter,
  run,
  pageDocument,
  profile,
  repository,
  addressSearch,
  onActivity,
  onAddressOperation,
  onWriteResult,
  setAddressResult,
}: {
  analysis: FieldsAnalyzeResponse;
  snapshot: ReturnType<typeof collectFieldsSnapshot>;
  adapter: WorkflowAdapter;
  run: AddressRun;
  pageDocument: Document;
  profile: Profile;
  repository: { load(): Promise<Profile> };
  addressSearch: AddressSearch;
  onActivity?: (activity: "address" | "matching") => void;
  onAddressOperation?: (element: Element) => void;
  onWriteResult?: WriteResultListener;
  setAddressResult: (result: Awaited<NonNullable<AddressRun["task"]>>) => void;
}): Promise<FieldsAnalyzeResponse | undefined> {
  const staged = stagedAddressNodes(pageDocument);
  if (staged) {
    // A populated original triplet belongs to the existing detail-only path.
    // Once this run owns an empty triplet it retains sole ownership, even on failure.
    if (!run.task && (!run.button || run.button !== staged.button))
      return analysis;
    if (!run.task && staged.fields.some((f) => f.value !== "")) {
      const result = await runStagedAddress({
        document: pageDocument,
        button: staged.button,
        expected: addressValue(profile),
        loadCurrent: async () => addressValue(await repository.load()),
        signal: run.controller.signal,
        search: addressSearch,
      });
      if (run.controller.signal.aborted) return;
      // The runner performs only readback for populated originals. Partial or
      // conflicting originals retain the independent legacy detail-only path.
      if (result.status === "written") {
        setAddressResult(result);
        return withoutAddressFields(
          analysis,
          snapshot,
          staged.policy.fields.flatMap((f) => [
            f.name,
            ...(f.legacyName ? [f.legacyName] : []),
          ]),
        );
      }
      return analysis;
    }
    const fields = snapshot.request.sections.flatMap((s) => [
      ...s.fields,
      ...(s.items ?? []).flatMap((i) => i.fields),
    ]);
    const candidates = staged.policy.fields.map((f, index) => {
      const found = fields.filter(
        (c) =>
          c.domName === f.name ||
          (!!f.legacyName && c.domName === f.legacyName),
      );
      if (found.length !== 1) return;
      const candidate = found[0],
        lookup = snapshot.registry.lookupField(candidate.candidateId);
      const mapping = analysis.fields.find(
        (m) => m.candidateId === candidate.candidateId,
      );
      return analysis.mode === "ADAPTER" &&
        candidate.domId === candidate.domName &&
        candidate.element === "input" &&
        candidate.control === "text" &&
        candidate.visibility === (f.hidden ? "hidden" : "visible") &&
        !!candidate.readonly === f.readonly &&
        !candidate.disabled &&
        !candidate.inert &&
        "handle" in lookup &&
        lookup.handle.isCurrentContext?.() !== false &&
        lookup.handle.elements.length === 1 &&
        lookup.handle.elements[0] === staged.fields[index] &&
        mapping?.matchType === "MATCH" &&
        mapping.mappingStatus === "ADAPTER_VERIFIED" &&
        mapping.valueBinding?.type === "DIRECT" &&
        mapping.valueBinding.profileFieldKey === f.key
        ? candidate
        : undefined;
    });
    const names = staged.policy.fields.flatMap((f) => [
      f.name,
      ...(f.legacyName ? [f.legacyName] : []),
    ]);
    if (!candidates.every(Boolean))
      return withoutAddressFields(analysis, snapshot, names);
    const original = staged.fields.map((f) => f.value);
    onActivity?.("address");
    if (!run.task) {
      const onClick = () => {
        onAddressOperation?.(staged.button);
      };
      staged.button.addEventListener("click", onClick, { once: true });
      run.task = runStagedAddress({
        document: pageDocument,
        button: staged.button,
        expected: addressValue(profile),
        loadCurrent: async () => addressValue(await repository.load()),
        signal: run.controller.signal,
        search: addressSearch,
      }).finally(() => staged.button.removeEventListener("click", onClick));
    }
    const result = await run.task;
    if (run.controller.signal.aborted) return;
    setAddressResult(result);
    const latest = stagedAddressNodes(pageDocument),
      expected = addressValue(await repository.load());
    const target = [expected.postalCode, expected.address, expected.detail];
    if (
      result.status === "written" &&
      latest &&
      latest.fields.every(
        (f, i) =>
          f === staged.fields[i] &&
          (i === 1
            ? normalizeStagedRoad(f.value) === normalizeStagedRoad(target[i])
            : f.value === target[i]),
      )
    ) {
      candidates.forEach((candidate, i) => {
        if (staged.fields[i].value === original[i]) return;
        onWriteResult?.(
          {
            candidateId: candidate!.candidateId,
            fieldLabel: ["우편번호", "기본주소", "상세주소"][i],
            profileFieldKey: staged.policy.fields[i].key,
            currentValue: original[i],
            profileValue: target[i],
            previewValue: target[i],
            status: "available",
            selected: true,
            disabled: false,
            revealed: true,
            reason: result.reason,
          },
          { candidateId: candidate!.candidateId, status: "written" },
          snapshot.registry,
        );
      });
    }
    onActivity?.("matching");
    return withoutAddressFields(analysis, snapshot, names);
  }
  const policy = executionPolicy(pageDocument)?.address;
  const runner =
    policy?.provider === "KAKAO" ? runKakaoAddress : adapter.runAddress;
  const addressNames = policy?.fieldNames ?? adapter.addressFieldNames ?? [];
  if (policy && !run.button) {
    const buttons = pageDocument.querySelectorAll(policy.triggerSelector);
    if (buttons.length === 1) run.button = buttons[0];
  }
  const keys = [
    "contact.contact.postalCode",
    "contact.contact.addressLine1",
    "contact.contact.addressLine2",
  ];
  const fields = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
  // Generic (non-adapter) pages have no policy provider and no adapter runner.
  // The Kakao postcode widget is vendor-generic, so the same executor can run
  // there when the three address keys map one-to-one onto visible native text
  // controls with the expected readonly split.
  const mappingFor = (candidateId: string) =>
    analysis.fields.find((field) => field.candidateId === candidateId);
  const genericAddressFields = keys.map((key) => {
    const matches = fields.filter((field) => {
      const mapping = mappingFor(field.candidateId);
      return (
        mapping !== undefined &&
        "valueBinding" in mapping &&
        mapping.valueBinding?.type === "DIRECT" &&
        mapping.valueBinding.profileFieldKey === key
      );
    });
    return matches.length === 1 ? matches[0] : undefined;
  });
  // Sites that already publish the postcode separately (or not at all) only
  // expose the road address plus its detail line, so require those two and
  // treat the postcode as optional.
  const genericRequired: readonly number[] = [1, 2];
  const genericFieldIsUsable = (field: (typeof genericAddressFields)[number], index: number) => {
    if (!field) return false;
    const mapping = mappingFor(field.candidateId);
    return (
      field.element === "input" &&
      field.control === "text" &&
      field.visibility === "visible" &&
      !field.disabled &&
      !field.inert &&
      !!field.readonly === index < 2 &&
      mapping?.matchType === "MATCH" &&
      mapping.mappingStatus === "LLM_SUGGESTED"
    );
  };
  const genericAddressPermitted =
    analysis.mode !== "ADAPTER" &&
    !policy &&
    !adapter.runAddress &&
    genericRequired.every((index) =>
      genericFieldIsUsable(genericAddressFields[index], index),
    ) &&
    (genericAddressFields[0] === undefined ||
      genericFieldIsUsable(genericAddressFields[0], 0));
  // Without an address runner, a generic search cannot drive a postcode
  // widget (it lives in nested cross-origin frames) and only leaves its layer
  // open over the form. Keep those address searches manual instead.
  if (
    !genericAddressPermitted &&
    analysis.mode !== "ADAPTER" &&
    !policy &&
    !adapter.runAddress
  ) {
    const manual = new Set(
      analysis.fields
        .filter(
          (field) =>
            "valueBinding" in field &&
            field.valueBinding?.type === "DIRECT" &&
            (keys as readonly string[]).includes(
              field.valueBinding.profileFieldKey,
            ) &&
            field.writePlan?.command === "SEARCH_SELECTION",
        )
        .map((field) => field.candidateId),
    );
    if (manual.size)
      return {
        ...analysis,
        fields: analysis.fields.filter(
          (field) => !manual.has(field.candidateId),
        ),
      };
  }
  const permitted =
    (analysis.mode === "ADAPTER" &&
      addressNames.length === 3 &&
    addressNames.every((name, index) => {
      const candidates = fields.filter(
        (field) => field.domId === name || field.domName === name,
      );
      if (candidates.length !== 1) return false;
      const candidate = candidates[0];
      const mapping = analysis.fields.find(
        (field) => field.candidateId === candidate.candidateId,
      );
      return (
        (candidate.domId ?? candidate.domName) === name &&
        candidate.domName === name &&
        candidate.element === "input" &&
        candidate.control === "text" &&
        candidate.visibility === "visible" &&
        !candidate.disabled &&
        !candidate.inert &&
        !!candidate.readonly === index < 2 &&
        mapping?.matchType === "MATCH" &&
        mapping.mappingStatus === "ADAPTER_VERIFIED" &&
        mapping.valueBinding?.type === "DIRECT" &&
        mapping.valueBinding.profileFieldKey === keys[index]
      );
    })) ||
    genericAddressPermitted;
  const effectiveAddressNames = genericAddressPermitted
    ? genericAddressFields.flatMap((field) =>
        field ? [field.domName ?? field.domId ?? ""] : [],
      )
    : addressNames;
  const effectiveRunner = genericAddressPermitted
    ? runKakaoAddress
    : runner;
  if (genericAddressPermitted && !run.button) {
    // Generic pages have no trigger selector: accept exactly one search-style
    // trigger inside the first address control's own row.
    const resolveElement = (
      field: (typeof genericAddressFields)[number],
    ): Element | null => {
      if (!field) return null;
      const lookup = snapshot.registry.lookupField(field.candidateId);
      const fromRegistry =
        "handle" in lookup ? lookup.handle.elements[0] : undefined;
      if (fromRegistry) return fromRegistry;
      // Readonly address inputs are registered as blocked, so fall back to the
      // collected name/id, which the analysis already validated as unique.
      const selector = field.domId
        ? `#${CSS.escape(field.domId)}`
        : field.domName
          ? `[name="${CSS.escape(field.domName)}"]`
          : undefined;
      return selector ? pageDocument.querySelector(selector) : null;
    };
    // The road-address control (index 1) is the one the search fills; the
    // postcode is optional and often absent.
    const element =
      resolveElement(genericAddressFields[1]) ??
      resolveElement(genericAddressFields[0]) ??
      resolveElement(genericAddressFields[2]);
    // Walk up a few ancestors and take the first level that exposes exactly one
    // address trigger. Search buttons often sit in a wrapper that overlays the
    // readonly input, so a single fixed selector is not enough.
    // Only address controls may share the trigger's scope, so a school or
    // certificate search elsewhere in the section is never taken for it.
    const addressElements = new Set(
      genericAddressFields.map((field) => resolveElement(field)).filter(Boolean),
    );
    const ownsOnlyAddress = (scope: Element) =>
      Array.from(
        scope.querySelectorAll<HTMLElement>("input, select, textarea"),
      ).every(
        (control) =>
          addressElements.has(control) ||
          (control instanceof HTMLInputElement &&
            ["hidden", "checkbox", "button", "submit"].includes(control.type)),
      );
    const matching = (scope: Element): HTMLElement[] =>
      ownsOnlyAddress(scope)
        ? Array.from(
            scope.querySelectorAll<HTMLElement>("button, [role='button']"),
          ).filter((button) => {
            const name = `${button.getAttribute("aria-label") ?? ""} ${button.getAttribute("title") ?? ""} ${button.textContent ?? ""}`;
            return (
              /검색|우편번호|주소\s*찾기/.test(name) &&
              !/동일|복사|같음|삭제|초기화/.test(name)
            );
          })
        : [];
    let scope: Element | null = element ?? null;
    for (let depth = 0; scope && depth < 5; depth += 1) {
      const triggers = matching(scope);
      if (triggers.length === 1) {
        run.button = triggers[0];
        break;
      }
      if (triggers.length > 1) break;
      scope = scope.parentElement;
    }
    localWorkflowLog("address-trigger", {
      snapshotId: snapshot.request.snapshotId,
      found: !!run.button,
      addressElement: !!element,
    });
  }
  localWorkflowLog("address-enter", {
    snapshotId: snapshot.request.snapshotId,
    hasButton: !!run.button,
    hasRunner: !!effectiveRunner,
    hasTask: !!run.task,
  });
  if (!run.button || !effectiveRunner)
    return adapter.addressRequiresSearch || genericAddressPermitted
      ? withoutAddressFields(analysis, snapshot, effectiveAddressNames)
      : analysis;
  const candidateSlots = genericAddressPermitted
    ? genericAddressFields.flatMap((field, index) =>
        field ? [{ field, index }] : [],
      )
    : addressNames.map((name, index) => ({
        field: fields.find(
          (field) => (field.domId ?? field.domName) === name,
        )!,
        index,
      }));
  const addressTargets = permitted
    ? candidateSlots.flatMap(({ field: candidate, index }) => {
        const lookup = snapshot.registry.lookupField(candidate.candidateId);
        const registryElement =
          "handle" in lookup ? lookup.handle.elements[0] : undefined;
        const blockedButNamed =
          lookup.status === "ready" || lookup.status === "blocked";
        const element =
          registryElement ??
          (genericAddressPermitted && blockedButNamed
            ? elementByCollectedName(pageDocument, candidate)
            : undefined);
        if (!element) return [];
        return element instanceof HTMLInputElement
          ? [
              {
                candidateId: candidate.candidateId,
                fieldLabel: ["우편번호", "기본주소", "상세주소"][index],
                profileFieldKey: keys[index],
                element,
                originalValue: element.value,
              },
            ]
          : [];
      })
    : [];
  localWorkflowLog("address-permission", {
    snapshotId: snapshot.request.snapshotId,
    permitted,
    targetCount: addressTargets.length,
  });
  if (permitted) onActivity?.("address");
  if (!run.task && permitted) {
    const button = run.button;
    const onClick = () => {
      if (button) onAddressOperation?.(button);
    };
    button?.addEventListener("click", onClick, { once: true });
    const targetFor = (key: string) =>
      addressTargets.find((target) => target.profileFieldKey === key)?.element;
    const genericAddress = targetFor(keys[1]);
    const genericDetail = targetFor(keys[2]);
    const genericPostalCode = targetFor(keys[0]);
    run.task = effectiveRunner({
      document: pageDocument,
      button,
      expected: addressValue(profile),
      loadCurrent: async () => addressValue(await repository.load()),
      signal: run.controller.signal,
      search: addressSearch,
      ...(genericAddressPermitted && genericAddress && genericDetail
        ? {
            targets: {
              address: genericAddress,
              detail: genericDetail,
              ...(genericPostalCode ? { postalCode: genericPostalCode } : {}),
            },
          }
        : {}),
    }).finally(() => button?.removeEventListener("click", onClick));
  }
  run.task ??= Promise.resolve({
    status: "manual",
    reason: "주소 입력란의 연결을 확인하지 못했습니다. 직접 확인해 주세요.",
  });
  const result = await run.task;
  localWorkflowLog("address-result", {
    snapshotId: snapshot.request.snapshotId,
    status: result.status,
    aborted: run.controller.signal.aborted,
  });
  if (run.controller.signal.aborted) return undefined;
  setAddressResult(result);
  if (result.status === "written") {
    for (const target of addressTargets) {
      const lookup = snapshot.registry.lookupField(target.candidateId);
      if (
        (lookup.status !== "ready" &&
          !(lookup.status === "blocked" && lookup.reason === "readonly")) ||
        lookup.handle.elements[0] !== target.element ||
        !target.element.value.trim() ||
        target.element.value === target.originalValue
      )
        continue;
      onWriteResult?.(
        {
          candidateId: target.candidateId,
          fieldLabel: target.fieldLabel,
          profileFieldKey: target.profileFieldKey,
          currentValue: target.originalValue,
          profileValue: target.element.value,
          previewValue: target.element.value,
          status: "available",
          selected: true,
          disabled: false,
          revealed: true,
          reason: result.reason,
        },
        { candidateId: target.candidateId, status: "written" },
        snapshot.registry,
      );
    }
  }
  onActivity?.("matching");
  return withoutAddressFields(analysis, snapshot, effectiveAddressNames);
}

function elementByCollectedName(
  pageDocument: Document,
  field: { domId?: string; domName?: string },
): Element | null {
  const selector = field.domId
    ? `#${CSS.escape(field.domId)}`
    : field.domName
      ? `[name="${CSS.escape(field.domName)}"]`
      : undefined;
  return selector ? pageDocument.querySelector(selector) : null;
}

function withoutAddressFields(
  analysis: FieldsAnalyzeResponse,
  snapshot: ReturnType<typeof collectFieldsSnapshot>,
  addressNames: readonly string[],
): FieldsAnalyzeResponse {
  const ids = new Set(
    snapshot.request.sections
      .flatMap((section) => [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ])
      .filter(
        (field) =>
          addressNames.includes(field.domId ?? "") ||
          addressNames.includes(field.domName ?? ""),
      )
      .map((field) => field.candidateId),
  );
  return {
    ...analysis,
    fields: analysis.fields.filter((field) => !ids.has(field.candidateId)),
  };
}
