import { debugCollectionSkip } from "../../debug/structural-diagnostics";
import { englishNameDomName } from "./english-name";
import {
  basicControls,
  basicName,
  basicSpecs,
  ownedBasicControl,
} from "./basic-controls";
import {
  detailControls,
  detailNames,
  detailSectionId,
  type DetailKey,
} from "./detail";
import type {
  FieldsAnalyzeRequest,
  SiteDescriptor,
  PreparationAnalyzeRequest,
} from "../../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../../dom/candidate-registry";
import type {
  CollectedSnapshot,
  PreparationCollectedSnapshot,
} from "../../dom/collect";
import {
  registrationControls,
  registrationNames,
  registrationSectionId,
  registrationBlockReason,
  type RegistrationKey,
} from "./registration";

export function collectHplaceFields(
  document: Document,
  snapshotId: string,
  site: SiteDescriptor,
): CollectedSnapshot<FieldsAnalyzeRequest> {
  if (detailControls(document))
    return collectDetailFields(document, snapshotId, site);
  const registry = new CandidateRegistry();
  const controls = registrationControls(document);
  const fields = controls
    ? (Object.keys(registrationNames) as RegistrationKey[]).map(
        (key, index) => {
          const inputs = controls[key];
          const reason = registrationBlockReason(inputs);
          if (reason)
            debugCollectionSkip(
              registrationNames[key],
              reason === "disabled" ? "disabled" : "owner-mismatch",
              reason,
            );
          const candidate = {
            candidateId: `field-${index + 1}`,
            domId: registrationNames[key],
            domName: registrationNames[key],
            element: "input" as const,
            control: "text" as const,
            displayName: { name: "성명", mobile: "휴대전화", email: "이메일" }[
              key
            ],
            visibility:
              reason === "hidden" ? ("hidden" as const) : ("visible" as const),
            ...(reason === "readonly" ? { readonly: true as const } : {}),
            ...(reason === "disabled" ? { disabled: true as const } : {}),
            ...(reason === "inert" ? { inert: true as const } : {}),
          };
          registry.registerField(
            {
              kind: "field",
              candidateId: candidate.candidateId,
              candidate,
              sectionId: registrationSectionId,
              elements: inputs,
              optionElements: new Map(),
              signature: createStructuralSignature(inputs),
              isCurrentContext: () =>
                registrationControls(document)?.[key].every(
                  (input, i) => input === inputs[i],
                ) === true,
            },
            reason,
          );
          return candidate;
        },
      )
    : [];
  return {
    registry,
    request: {
      schemaVersion: 2,
      snapshotId,
      site,
      sections: fields.length
        ? [{ sectionId: registrationSectionId, fields }]
        : [],
    },
  };
}

export function collectHplacePreparation(
  document: Document,
  snapshotId: string,
  site: SiteDescriptor,
): PreparationCollectedSnapshot {
  const request: PreparationAnalyzeRequest = {
    schemaVersion: 2,
    snapshotId,
    site,
    sections: detailControls(document)
      ? [{ sectionId: detailSectionId, actionCandidates: [] }]
      : registrationControls(document)
        ? [{ sectionId: registrationSectionId, actionCandidates: [] }]
        : [],
  };
  return {
    request,
    registry: new CandidateRegistry(),
    isSectionVisible: () =>
      Boolean(registrationControls(document) || detailControls(document)),
    countRepeatableGroups: () => undefined,
    repeatableGroupState: () => undefined,
    repeatableGroupLimit: () => undefined,
  };
}

function collectDetailFields(
  document: Document,
  snapshotId: string,
  site: SiteDescriptor,
): CollectedSnapshot<FieldsAnalyzeRequest> {
  const registry = new CandidateRegistry();
  const controls = detailControls(document)!;
  const fields: import("../../api/types").FieldCandidate[] = (
    Object.keys(controls) as DetailKey[]
  ).map((key, index) => {
    const input = controls[key]!;
    const reason = registrationBlockReason([input]);
    if (reason)
      debugCollectionSkip(
        detailNames[key],
        reason === "disabled" ? "disabled" : "owner-mismatch",
        reason,
      );
    const candidate = {
      candidateId: `field-${index + 1}`,
      domId:
        key === "englishName" ? englishNameDomName(input) : detailNames[key],
      domName:
        key === "englishName" ? englishNameDomName(input) : detailNames[key],
      element: "input" as const,
      control: "text" as const,
      displayName: {
        englishName: "영문이름",
        birthday: "생년월일",
        detailAddress: "상세주소",
        emergencyPhone: "비상연락처",
      }[key],
      visibility:
        reason === "hidden" ? ("hidden" as const) : ("visible" as const),
      ...(reason === "readonly" ? { readonly: true as const } : {}),
      ...(reason === "disabled" ? { disabled: true as const } : {}),
      ...(reason === "inert" ? { inert: true as const } : {}),
    };
    registry.registerField(
      {
        kind: "field",
        candidateId: candidate.candidateId,
        candidate,
        sectionId: detailSectionId,
        elements: [input],
        optionElements: new Map(),
        signature: createStructuralSignature([input]),
        isCurrentContext: () =>
          detailControls(document)?.[key] === input &&
          (key !== "englishName" ||
            candidate.domName === englishNameDomName(input)),
      },
      reason,
    );
    return candidate;
  });
  for (const control of basicControls(document)) {
    const spec = basicSpecs[control.key];
    const candidate = {
      candidateId: `field-${fields.length + 1}`,
      domId: basicName(control.key),
      domName: basicName(control.key),
      element:
        spec.kind === "select" ? ("select" as const) : ("input" as const),
      control: spec.kind,
      displayName: spec.label,
      visibility: "visible" as const,
      options:
        spec.kind === "text"
          ? undefined
          : [...control.options].map(([optionId, e]) => ({
              optionId,
              displayName:
                e instanceof HTMLOptionElement
                  ? e.textContent!.trim()
                  : (spec.options as Record<string, string>)[optionId],
            })),
    };
    const handle = {
      kind: "field" as const,
      candidateId: candidate.candidateId,
      candidate,
      sectionId: detailSectionId,
      elements: control.elements,
      optionElements: control.options,
      signature: createStructuralSignature(control.elements),
      isCurrentContext: () => ownedBasicControl(handle) !== undefined,
    };
    registry.registerField(handle);
    fields.push(candidate);
  }
  return {
    registry,
    request: {
      schemaVersion: 2,
      snapshotId,
      site,
      sections: [{ sectionId: detailSectionId, fields }],
    },
  };
}
