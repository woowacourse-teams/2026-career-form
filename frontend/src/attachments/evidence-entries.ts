import type { Profile } from "../profile/model";

export interface EvidenceEntry {
  entryId: string;
  /** Test or certificate name shown when choosing which evidence to attach. */
  label: string;
}

/** Language-test and certificate entries are the ones that keep evidence. */
export function evidenceEntries(profile: Profile): EvidenceEntry[] {
  const tests = profile.languages
    .filter((entry) => entry.sectionId === "languageTest")
    .map((entry) => ({
      entryId: entry.id,
      label:
        [entry.values.testName, entry.values.grade]
          .map((value) => value?.trim())
          .filter(Boolean)
          .join(" ") || "공인외국어시험",
    }));
  const certificates = profile.certifications
    .filter((entry) => entry.sectionId === "certificate")
    .map((entry) => ({
      entryId: entry.id,
      label: entry.values.name?.trim() || "자격증·면허증",
    }));
  return [...tests, ...certificates];
}

export function hasEvidence(sectionId: string, fieldId: string): boolean {
  return (
    fieldId === "evidenceDocumentPath" &&
    (sectionId === "languageTest" || sectionId === "certificate")
  );
}
