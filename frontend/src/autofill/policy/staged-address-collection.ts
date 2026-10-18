import {
  createStructuralSignature,
  type CandidateRegistry,
} from "../dom/candidate-registry";
import type { FieldsSection, PreparationAnalyzeRequest } from "../api/types";
import { executionPolicy } from "../workflow/execution-policy";
import { sameAddressNodes, stagedAddressNodes } from "./staged-address-dom";
export function collectStagedAddress(
  document: Document,
  registry: CandidateRegistry,
  sections: FieldsSection[],
) {
  const n = stagedAddressNodes(document);
  if (!n) return;
  const digest = JSON.stringify(executionPolicy(document)),
    url = document.URL;
  const current = () =>
    document.URL === url &&
    JSON.stringify(executionPolicy(document)) === digest &&
    sameAddressNodes(n, stagedAddressNodes(document));
  const existing = sections.flatMap((s) => s.fields);
  const reusedIndexes = new Set<number>();
  for (const [i, f] of n.policy.fields.entries()) {
    if (f.legacyName === undefined) continue;
    const reused = existing.filter((c) => c.domName === f.legacyName);
    if (!reused.length) continue;
    if (reused.length !== 1) return;
    const lookup = registry.lookupField(reused[0].candidateId);
    if (
      !("handle" in lookup) ||
      lookup.handle.elements.length !== 1 ||
      lookup.handle.elements[0] !== n.fields[i]
    )
      return;
    reusedIndexes.add(i);
  }
  const fields = n.policy.fields.flatMap((f, i) => {
    if (reusedIndexes.has(i)) return [];
    const candidate = {
      candidateId: `staged-address-${i}`,
      domId: f.name,
      domName: f.name,
      element: "input" as const,
      control: "text" as const,
      displayName: ["우편번호", "기본주소", "상세주소"][i],
      visibility: f.hidden ? ("hidden" as const) : ("visible" as const),
      ...(f.readonly ? { readonly: true as const } : {}),
    };
    registry.registerField(
      {
        kind: "field",
        owner: "native",
        candidateId: candidate.candidateId,
        candidate,
        sectionId: n.policy.sectionId,
        elements: [n.fields[i]],
        optionElements: new Map(),
        signature: createStructuralSignature([n.fields[i]]),
        isCurrentContext: current,
      },
      f.hidden ? "hidden" : f.readonly ? "readonly" : undefined,
    );
    return [candidate];
  });
  if (fields.length)
    sections.push({
      sectionId: n.policy.sectionId,
      displayName: "현주소",
      fields,
    });
}
export function collectStagedAddressAction(
  document: Document,
  registry: CandidateRegistry,
  sections: PreparationAnalyzeRequest["sections"],
) {
  const n = stagedAddressNodes(document);
  if (!n) return;
  const digest = JSON.stringify(executionPolicy(document)),
    url = document.URL;
  const candidate = {
    candidateId: "staged-address-action",
    domId: n.policy.actionId,
    element: "button" as const,
    control: "button" as const,
    displayName: n.policy.triggerLabel,
    visibility: "visible" as const,
  };
  registry.registerAction({
    kind: "action",
    owner: "native",
    candidateId: candidate.candidateId,
    candidate,
    sectionId: n.policy.sectionId,
    element: n.button,
    signature: createStructuralSignature([n.button]),
    isCurrentContext: () =>
      document.URL === url &&
      JSON.stringify(executionPolicy(document)) === digest &&
      sameAddressNodes(n, stagedAddressNodes(document)),
  });
  sections.push({
    sectionId: n.policy.sectionId,
    displayName: "현주소",
    actionCandidates: [candidate],
  });
}
