import { createEmptyProfile } from "../../src/profile/model";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import type { AnalysisApiClient } from "../../src/autofill/api/types";
export const exampleFields = [
  ["family-name", "성", "personal.personal.koreanFamilyName"],
  ["given-name", "이름", "personal.personal.koreanGivenName"],
  ["email", "이메일", "contact.contact.email"],
  ["phone", "휴대전화", "contact.contact.phoneNumber"],
  ["school", "학교명", "education.university.schoolName"],
  ["major", "전공", "education.university.majorName"],
  ["graduated", "졸업일", "education.university.endDate"],
  ["gpa", "학점", "education.university.gpaScore"],
  ["certificate", "자격증", "certifications.certificate.name"],
  ["acquired", "취득일", "certifications.certificate.acquisitionDate"],
] as const;
export function createDemoRepository(): ProfileRepository {
  return {
    load: async () => ({
      ...createEmptyProfile(),
      personal: { koreanFamilyName: "김", koreanGivenName: "커리어" },
      contact: { email: "career@example.com", phoneNumber: "01000000000" },
      education: [
        {
          id: "example-university",
          sectionId: "university",
          values: {
            degreeLevel: "학사",
            schoolName: "커리어대학교",
            majorName: "컴퓨터공학",
            completionStatus: "졸업",
            startDate: "2020-03-02",
            endDate: "2026-02-20",
            gpaScore: "4.0",
            gpaScale: "4.50",
          },
        },
      ],
      certifications: [
        {
          id: "example-certificate",
          sectionId: "certificate",
          values: {
            name: "정보처리기사",
            issuer: "한국산업인력공단",
            acquisitionDate: "2025-06-13",
          },
        },
      ],
    }),
    save: async () => {},
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
}
export const demoAnalysisClient: AnalysisApiClient = {
  analyzePreparation: async (r) => ({
    snapshotId: r.snapshotId,
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    preparationPlans: [],
  }),
  analyzeFields: async (r) => ({
    snapshotId: r.snapshotId,
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    fields: r.sections
      .flatMap((s) => [
        ...s.fields,
        ...(s.items ?? []).flatMap((i) => i.fields),
      ])
      .flatMap((field) => {
        const match = exampleFields.find(([id]) => id === field.domId);
        return match
          ? [
              {
                candidateId: field.candidateId,
                matchType: "MATCH" as const,
                valueBinding: {
                  type: "DIRECT" as const,
                  profileFieldKey: match[2],
                },
                autofillPolicy: "ALLOWED" as const,
                mappingStatus: "ADAPTER_VERIFIED" as const,
                interactionStatus: "READY" as const,
                writePlan: { command: "SET_TEXT" as const },
              },
            ]
          : [];
      }),
  }),
};
