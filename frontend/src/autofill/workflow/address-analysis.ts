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
  if (!run.button || !adapter.runAddress) return analysis;
  const addressNames = adapter.addressFieldNames ?? [];
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
        candidate.domId === name &&
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
        const candidate = fields.find((field) => field.domId === name)!;
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
  if (permitted) onActivity?.("address");
  if (!run.task && permitted) {
    const button = run.button;
    const onClick = () => {
      if (button) onAddressOperation?.(button);
    };
    button?.addEventListener("click", onClick, { once: true });
    run.task = adapter
      .runAddress({
        document: pageDocument,
        button,
        expected: addressValue(profile),
        loadCurrent: async () => addressValue(await repository.load()),
        signal: run.controller.signal,
        search: addressSearch,
      })
      .finally(() => button?.removeEventListener("click", onClick));
  }
  run.task ??= Promise.resolve({
    status: "manual",
    reason: "주소 입력란의 연결을 확인하지 못했습니다. 직접 확인해 주세요.",
  });
  const result = await run.task;
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
  const ids = new Set(
    fields
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
