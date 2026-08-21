package com.careerform.llm.mapping;

import java.util.Set;

final class ProfileFieldKeys {

    private static final Set<String> ALLOWED = Set.of(
        "personal.koreanFamilyName",
        "personal.koreanGivenName",
        "personal.hanjaFamilyName",
        "personal.hanjaGivenName",
        "personal.englishFamilyName",
        "personal.englishGivenName",
        "personal.gender",
        "personal.birthDate",
        "personal.nationality",
        "contact.email",
        "contact.phoneNumber",
        "contact.postalCode",
        "contact.addressLine1",
        "contact.addressLine2",
        "education.degreeLevel",
        "education.country",
        "education.schoolName",
        "education.startDate",
        "education.endDate",
        "education.admissionType",
        "education.completionStatus",
        "education.gpaScore",
        "education.gpaScale",
        "education.majorClassification",
        "education.majorField",
        "education.majorName",
        "education.additionalMajorClassification",
        "education.additionalMajorField",
        "education.additionalMajorName",
        "languages.language",
        "languages.testName",
        "languages.registrationNo",
        "languages.acquisitionDate",
        "languages.grade",
        "languages.conversationalLevel",
        "certifications.name",
        "certifications.grade",
        "certifications.registrationNo",
        "certifications.issuer",
        "certifications.acquisitionDate",
        "projects.startDate",
        "projects.endDate",
        "projects.projectName",
        "projects.role",
        "projects.activityDetails",
        "military.militaryStatus",
        "military.militaryBranch",
        "military.militarySpecialty",
        "military.militaryRank",
        "military.serviceStartDate",
        "military.serviceEndDate",
        "military.dischargeType",
        "military.exemptionReason",
        "veteran.veteranStatus",
        "veteran.veteranType",
        "veteran.veteranRelation",
        "veteran.veteranNumber",
        "disability.disabilityStatus",
        "disability.disabilityType",
        "disability.disabilityGrade",
        "disability.disabilityRegistrationDate",
        "health.healthItemName",
        "health.healthStatusOrValue",
        "health.healthDate",
        "health.healthDetails"
    );

    private ProfileFieldKeys() {
    }

    static boolean isAllowed(String key) {
        return ALLOWED.contains(key);
    }

    static Set<String> values() {
        return ALLOWED;
    }
}
