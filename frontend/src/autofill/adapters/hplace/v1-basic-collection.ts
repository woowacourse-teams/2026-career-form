import type {
  FieldCandidate,
  FieldsAnalyzeRequest,
  SiteDescriptor,
} from "../../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../../dom/candidate-registry";
import type { CollectedSnapshot } from "../../dom/collect";
import type { FieldCandidateHandle } from "../../dom/types";
import {
  ownedV1Control,
  v1BasicControls,
  v1Name,
  v1OptionEntries,
  v1SectionId,
  v1Spec,
} from "./v1-basic-controls";

/** One `hplace-v1-basic` section of the verified, enabled step-1 controls. */
export function collectV1Fields(
  document: Document,
  snapshotId: string,
  site: SiteDescriptor,
): CollectedSnapshot<FieldsAnalyzeRequest> {
  const registry = new CandidateRegistry();
  const fields: FieldCandidate[] = v1BasicControls(document).map(
    (control, index) => {
      const spec = v1Spec(control.key);
      const name = v1Name(control.key);
      const choice = spec.kind === "radio" || spec.kind === "toggle";
      const candidate: FieldCandidate = {
        candidateId: `field-${index + 1}`,
        domId: name,
        domName: name,
        element: spec.kind === "dropdown" ? "select" : "input",
        control:
          spec.kind === "dropdown" ? "select" : choice ? "radio" : "text",
        displayName: spec.label,
        // Always visible and never `disabled`, including the 현주소 inputs:
        // the page keeps those disabled, but they are logical targets that
        // only the address dialog writes (the backend fingerprint rejects
        // disabled candidates).
        visibility: "visible",
        ...("options" in spec
          ? {
              options: v1OptionEntries(control.key)
                .filter(([id]) => !choice || control.options.has(id))
                .map(([optionId, displayName]) => ({ optionId, displayName })),
            }
          : {}),
      };
      const handle: FieldCandidateHandle = {
        kind: "field",
        candidateId: candidate.candidateId,
        candidate,
        sectionId: v1SectionId,
        elements: control.elements,
        ...(control.custom.length ? { customElements: control.custom } : {}),
        optionElements: control.options,
        signature: createStructuralSignature([
          ...control.elements,
          ...control.custom,
        ]),
        isCurrentContext: () => ownedV1Control(handle) !== undefined,
      };
      registry.registerField(handle);
      return candidate;
    },
  );
  return {
    registry,
    request: {
      schemaVersion: 2,
      snapshotId,
      site,
      sections: fields.length ? [{ sectionId: v1SectionId, fields }] : [],
    },
  };
}
