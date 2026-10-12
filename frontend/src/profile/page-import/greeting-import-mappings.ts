import { PROFILE_CATEGORIES } from "../field-definitions";
import type { ProfileCategoryId } from "../model";

/** Exact paths observed in Greeting's public forms and existing company policy. */
export const greetingImportMappings: Readonly<Record<string, string>> = {
  "applicationDetail.previousSalary":
    "compensation.compensation.previousSalary",
  "applicationDetail.desiredSalary.salary":
    "compensation.compensation.desiredSalary",
  "basicInformation.email": "contact.contact.email",
  "basicInformation.phoneNumber.nationalNumber": "contact.contact.phoneNumber",
  "basicInformation.nationalityCode": "personal.personal.nationality",
  "basicInformation.birthdate": "personal.personal.birthDate",
  "basicInformation.gender": "personal.personal.gender",
  "personalInformation.currentAddress.postalCode": "contact.contact.postalCode",
  "personalInformation.currentAddress.address": "contact.contact.addressLine1",
  "personalInformation.currentAddress.detailedAddress":
    "contact.contact.addressLine2",
};
const education = {
  schoolName: "schoolName",
  degreeLevel: "degreeLevel",
  "enrollmentPeriod.startDate": "startDate",
  "enrollmentPeriod.endDate": "endDate",
  completionStatus: "completionStatus",
  attendanceType: "attendanceType",
  schoolLocation: "schoolRegion",
  "gpa.score": "gpaScore",
  "gpa.scoreScale": "gpaScale",
  "majors.0": "majorName",
};
export const greetingRepeatedMappings: Readonly<
  Record<
    string,
    {
      category: ProfileCategoryId;
      section: string;
      fields: Readonly<Record<string, string>>;
    }
  >
> = {
  universities: {
    category: "education",
    section: "university",
    fields: {
      ...education,
      totalCreditsEarned: "totalCredits",
      admissionType: "transferStatus",
    },
  },
  graduateSchools: {
    category: "education",
    section: "graduateSchool",
    fields: {
      ...education,
      admissionType: "admissionType",
      "majors.0.majorClassification": "majorClassification",
      "majors.0.majorField": "majorField",
      "majors.1": "additionalMajorName",
      "majors.1.majorClassification": "additionalMajorClassification",
      "majors.1.majorField": "additionalMajorField",
    },
  },
  highSchool: {
    category: "education",
    section: "highSchool",
    fields: {
      schoolName: "schoolName",
      completionStatus: "completionStatus",
      schoolLocation: "schoolRegion",
      "enrollmentPeriod.startDate": "startDate",
      "enrollmentPeriod.endDate": "endDate",
    },
  },
  workExperiences: {
    category: "careers",
    section: "career",
    fields: {
      companyName: "companyName",
      employmentType: "employmentType",
      "employmentPeriod.startDate": "startDate",
      "employmentPeriod.endDate": "endDate",
      employmentStatus: "employmentStatus",
      department: "department",
      positionRank: "position",
      dutiesResponsibility: "responsibilities",
      reasonForResignation: "terminationReason",
    },
  },
  projects: {
    category: "projects",
    section: "project",
    fields: {
      projectName: "projectName",
      roleParticipationRole: "role",
      "projectPeriod.startDate": "startDate",
      "projectPeriod.endDate": "endDate",
      projectDescription: "activityDetails",
    },
  },
  certifiedLanguageTests: {
    category: "languages",
    section: "languageTest",
    fields: {
      foreignLanguage: "language",
      testName: "testName",
      acquisitionDate: "acquisitionDate",
      grade: "grade",
      "score.score": "grade",
      registrationNumber: "registrationNo",
    },
  },
  foreignLanguageProficiencies: {
    category: "languages",
    section: "languageSkill",
    fields: {
      foreignLanguage: "language",
      conversationalProficiency: "conversationalLevel",
    },
  },
  certificatesLicenses: {
    category: "certifications",
    section: "certificate",
    fields: {
      credentials: "name",
      issuingAgency: "issuer",
      acquisitionDate: "acquisitionDate",
      rating: "grade",
      registrationNumber: "registrationNo",
    },
  },
};
export const greetingSensitiveMappings: Readonly<Record<string, string>> = {
  "militaryService.militaryServiceStatus": "military.military.militaryStatus",
  "militaryService.branchOfService": "military.military.militaryBranch",
  "militaryService.rank": "military.military.militaryRank",
  "militaryService.servicePeriod.startDate":
    "military.military.serviceStartDate",
  "militaryService.servicePeriod.endDate": "military.military.serviceEndDate",
  "militaryService.militaryOccupationalSpecialty":
    "military.military.militarySpecialty",
  "militaryService.militaryServiceClassification":
    "military.military.militaryType",
  "militaryService.dischargeType": "military.military.dischargeType",
  "disability.disabilityStatus": "disability.disability.disabilityStatus",
  "disability.degreeOfDisability": "disability.disability.disabilityGrade",
  "disability.descriptionOfDisability": "disability.disability.disabilityType",
  "disability.disabilityRegistrationNumber":
    "disability.disability.disabilityRegistrationNumber",
  "veteran.veteranStatus": "veteran.veteran.veteranStatus",
  "veteranStatus.veteransRegistrationNumber": "veteran.veteran.veteranNumber",
  "veteranStatus.veteranRelationship": "veteran.veteran.veteranRelation",
};
export function importDefinition(key: string) {
  const [categoryId, sectionId, fieldId] = key.split(".");
  const category = PROFILE_CATEGORIES.find((item) => item.id === categoryId);
  const section = category?.sections.find((item) => item.id === sectionId);
  const field = section?.fields.find((item) => item.id === fieldId);
  return category && section && field
    ? { category, section, field }
    : undefined;
}
