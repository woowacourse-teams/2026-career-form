import { createDemoProfile, createDemoRepository } from "../demo/fixtures";
import type { ProfileRepository } from "../../src/profile/profile-repository";
export function createExperimentProfile() {
  const base = createDemoProfile();
  return {
    ...base,
    personal: {
      ...base.personal,
      hanjaFamilyName: "金",
      hanjaGivenName: "志元",
      birthDate: "1998-05-14",
    },
    contact: {
      ...base.contact,
      secondaryEmail: "career.backup@example.com",
      emergencyPhoneNumber: "01011111111",
      postalCode: "00000",
      addressLine1: "예시시 예시구 예시로 10",
      addressLine2: "예시동 101호",
    },
    education: base.education.map((entry) => ({
      ...entry,
      values: {
        ...entry.values,
        schoolRegion: "서울",
        totalCredits: "132",
        attendanceType: "주간",
      },
    })),
    languages: [
      {
        id: "experiment-language",
        sectionId: "languageTest",
        values: {
          language: "영어",
          testName: "TOEIC",
          grade: "900",
          registrationNo: "DEMO-EN-001",
          acquisitionDate: "2025-03-15",
        },
      },
    ],
    careers: [
      {
        id: "experiment-career",
        sectionId: "career",
        values: {
          companyName: "예시테크",
          department: "서비스개발팀",
          position: "개발 인턴",
          startDate: "2025-07-01",
          endDate: "2025-12-31",
        },
      },
    ],
  };
}
export const experimentRepository: ProfileRepository = {
  ...createDemoRepository(),
  load: async () => createExperimentProfile(),
};
