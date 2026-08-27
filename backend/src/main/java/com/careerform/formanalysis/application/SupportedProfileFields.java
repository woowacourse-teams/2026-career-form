package com.careerform.formanalysis.application;

import static java.util.Map.entry;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;

import org.springframework.stereotype.Component;

import com.careerform.formanalysis.dto.FieldsAnalysisResponse.AutofillPolicy;

@Component
public final class SupportedProfileFields {

    private static final Map<String, AutofillPolicy> ENTRIES = entries(
        entry("personal.personal.koreanFamilyName", AutofillPolicy.ALLOWED),
        entry("personal.personal.koreanGivenName", AutofillPolicy.ALLOWED),
        entry("personal.personal.hanjaFamilyName", AutofillPolicy.ALLOWED),
        entry("personal.personal.hanjaGivenName", AutofillPolicy.ALLOWED),
        entry("personal.personal.englishFamilyName", AutofillPolicy.ALLOWED),
        entry("personal.personal.englishGivenName", AutofillPolicy.ALLOWED),
        entry("personal.personal.gender", AutofillPolicy.CONDITIONAL),
        entry("personal.personal.birthDate", AutofillPolicy.ALLOWED),
        entry("personal.personal.nationality", AutofillPolicy.CONDITIONAL),
        entry("contact.contact.postalCode", AutofillPolicy.CONDITIONAL),
        entry("contact.contact.addressLine1", AutofillPolicy.CONDITIONAL),
        entry("contact.contact.addressLine2", AutofillPolicy.ALLOWED),
        entry("contact.contact.email", AutofillPolicy.ALLOWED),
        entry("contact.contact.phoneNumber", AutofillPolicy.ALLOWED),
        entry("education.highSchool.schoolName", AutofillPolicy.CONDITIONAL),
        entry("education.highSchool.startDate", AutofillPolicy.ALLOWED),
        entry("education.highSchool.endDate", AutofillPolicy.ALLOWED),
        entry("education.university.degreeLevel", AutofillPolicy.CONDITIONAL),
        entry("education.university.schoolName", AutofillPolicy.CONDITIONAL),
        entry("education.university.startDate", AutofillPolicy.ALLOWED),
        entry("education.university.endDate", AutofillPolicy.ALLOWED),
        entry("education.university.completionStatus", AutofillPolicy.CONDITIONAL),
        entry("education.university.gpaScore", AutofillPolicy.ALLOWED),
        entry("education.university.majorName", AutofillPolicy.CONDITIONAL),
        entry("education.university.additionalMajorName", AutofillPolicy.CONDITIONAL),
        entry("education.graduateSchool.degreeLevel", AutofillPolicy.CONDITIONAL),
        entry("education.graduateSchool.country", AutofillPolicy.CONDITIONAL),
        entry("education.graduateSchool.schoolName", AutofillPolicy.CONDITIONAL),
        entry("education.graduateSchool.startDate", AutofillPolicy.ALLOWED),
        entry("education.graduateSchool.endDate", AutofillPolicy.ALLOWED),
        entry("education.graduateSchool.admissionType", AutofillPolicy.CONDITIONAL),
        entry("education.graduateSchool.completionStatus", AutofillPolicy.CONDITIONAL),
        entry("education.graduateSchool.gpaScore", AutofillPolicy.ALLOWED),
        entry("education.graduateSchool.gpaScale", AutofillPolicy.CONDITIONAL),
        entry("education.graduateSchool.majorClassification", AutofillPolicy.CONDITIONAL),
        entry("education.graduateSchool.majorField", AutofillPolicy.CONDITIONAL),
        entry("education.graduateSchool.majorName", AutofillPolicy.CONDITIONAL),
        entry(
            "education.graduateSchool.additionalMajorClassification",
            AutofillPolicy.CONDITIONAL
        ),
        entry("education.graduateSchool.additionalMajorField", AutofillPolicy.CONDITIONAL),
        entry("education.graduateSchool.additionalMajorName", AutofillPolicy.CONDITIONAL),
        entry("languages.languageTest.language", AutofillPolicy.CONDITIONAL),
        entry("languages.languageTest.testName", AutofillPolicy.CONDITIONAL),
        entry("languages.languageTest.registrationNo", AutofillPolicy.ALLOWED),
        entry("languages.languageTest.acquisitionDate", AutofillPolicy.ALLOWED),
        entry("languages.languageTest.grade", AutofillPolicy.ALLOWED),
        entry("languages.languageSkill.language", AutofillPolicy.CONDITIONAL),
        entry("languages.languageSkill.conversationalLevel", AutofillPolicy.CONDITIONAL),
        entry("certifications.certificate.name", AutofillPolicy.CONDITIONAL),
        entry("certifications.certificate.grade", AutofillPolicy.ALLOWED),
        entry("certifications.certificate.registrationNo", AutofillPolicy.ALLOWED),
        entry("certifications.certificate.issuer", AutofillPolicy.CONDITIONAL),
        entry("certifications.certificate.acquisitionDate", AutofillPolicy.ALLOWED),
        entry("projects.project.startDate", AutofillPolicy.ALLOWED),
        entry("projects.project.endDate", AutofillPolicy.ALLOWED),
        entry("projects.project.projectName", AutofillPolicy.ALLOWED),
        entry("projects.project.role", AutofillPolicy.ALLOWED),
        entry("projects.project.activityDetails", AutofillPolicy.ALLOWED),
        entry("military.military.militaryStatus", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("military.military.militaryBranch", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("military.military.militarySpecialty", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("military.military.militaryRank", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("military.military.serviceStartDate", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("military.military.serviceEndDate", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("military.military.dischargeType", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("military.military.exemptionReason", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("veteran.veteran.veteranStatus", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("veteran.veteran.veteranType", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("veteran.veteran.veteranRelation", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("veteran.veteran.veteranNumber", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("disability.disability.disabilityStatus", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("disability.disability.disabilityType", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("disability.disability.disabilityGrade", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry(
            "disability.disability.disabilityRegistrationDate",
            AutofillPolicy.SENSITIVE_CONFIRMATION
        ),
        entry("health.health.healthItemName", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("health.health.healthStatusOrValue", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("health.health.healthDate", AutofillPolicy.SENSITIVE_CONFIRMATION),
        entry("health.health.healthDetails", AutofillPolicy.SENSITIVE_CONFIRMATION)
    );

    public Set<String> keys() {
        return Collections.unmodifiableSet(new TreeSet<>(ENTRIES.keySet()));
    }

    public boolean contains(String key) {
        return key != null && ENTRIES.containsKey(key);
    }

    public Optional<AutofillPolicy> policyOf(String key) {
        return Optional.ofNullable(ENTRIES.get(key));
    }

    @SafeVarargs
    private static Map<String, AutofillPolicy> entries(
        Map.Entry<String, AutofillPolicy>... entries
    ) {
        Map<String, AutofillPolicy> result = new LinkedHashMap<>();
        for (Map.Entry<String, AutofillPolicy> entry : entries) {
            result.put(entry.getKey(), entry.getValue());
        }
        return Collections.unmodifiableMap(result);
    }
}
