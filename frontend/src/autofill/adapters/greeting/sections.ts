/** Exact public Greeting form prefixes, owned labels and row anchors. */
export const greetingSections = {
  universities: {
    label: "대학교",
    prefix: "educationalBackground.universities",
    group: "educationuniversity",
    anchor: "schoolName",
    singleton: false,
  },
  graduateSchools: {
    label: "대학원",
    prefix: "educationalBackground.graduateSchools",
    group: "educationgraduateschool",
    anchor: "schoolName",
    singleton: false,
  },
  highSchool: {
    label: "고등학교",
    prefix: "educationalBackground.highSchool",
    group: "educationhighschool",
    anchor: "schoolName",
    singleton: true,
  },
  workExperiences: {
    label: "직장경력",
    prefix: "workHistory.workExperiences",
    group: "careerscareer",
    anchor: "companyName",
    singleton: false,
  },
  certifiedLanguageTests: {
    label: "공인외국어시험",
    prefix: "languagesCertificationsAndOtherActivity.certifiedLanguageTests",
    group: "languageslanguagetest",
    anchor: "testName",
    singleton: false,
  },
  foreignLanguageProficiencies: {
    label: "외국어활용능력",
    prefix:
      "languagesCertificationsAndOtherActivity.foreignLanguageProficiencies",
    group: "languageslanguageskill",
    anchor: "foreignLanguage",
    singleton: false,
  },
  projects: {
    label: "프로젝트",
    prefix: "workHistory.projects",
    group: "projectsproject",
    anchor: "projectName",
    singleton: false,
  },
  certificatesLicenses: {
    label: "자격증/면허증",
    prefix: "languagesCertificationsAndOtherActivity.certificatesLicenses",
    group: "certificationscertificate",
    anchor: "credentials",
    singleton: false,
  },
} as const;
export type GreetingSectionKind = keyof typeof greetingSections;

export function greetingSectionPrefix(kind: GreetingSectionKind): string {
  const section = greetingSections[kind];
  return `${section.prefix}${section.singleton ? "" : "."}`;
}
