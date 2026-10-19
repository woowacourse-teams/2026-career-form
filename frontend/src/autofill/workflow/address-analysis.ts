import { debugPreparationCounts } from "../debug/structural-diagnostics";
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
        debugPreparationCounts("address", 1, 1);
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
  localWorkflowLog("address-enter", {
    snapshotId: snapshot.request.snapshotId,
    hasButton: !!run.button,
    hasRunner: !!runner,
    hasTask: !!run.task,
  });
  if (!run.button || !runner)
    return adapter.addressRequiresSearch
      ? withoutAddressFields(analysis, snapshot, addressNames)
      : analysis;
  const keys = [
    "contact.contact.postalCode",
    "contact.contact.addressLine1",
    "contact.contact.addressLine2",
  ];
  const fields = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
  const permitted =
    analysis.mode === "ADAPTER" &&
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
    });
  const addressTargets = permitted
    ? addressNames.flatMap((name, index) => {
        const candidate = fields.find(
          (field) => (field.domId ?? field.domName) === name,
        )!;
        const lookup = snapshot.registry.lookupField(candidate.candidateId);
        if (lookup.status !== "ready" && lookup.status !== "blocked") return [];
        const element = lookup.handle.elements[0];
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
    run.task = runner({
      document: pageDocument,
      button,
      expected: addressValue(profile),
      loadCurrent: async () => addressValue(await repository.load()),
      signal: run.controller.signal,
      search: addressSearch,
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
  return withoutAddressFields(analysis, snapshot, addressNames);
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
