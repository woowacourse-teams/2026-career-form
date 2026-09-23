package com.careerform.formanalysis.application;

import static java.util.Map.entry;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.careerform.formanalysis.dto.FieldsAnalysisResponse.AutofillPolicy;

@Component
public final class SupportedProfileFields {

    private static final Pattern CAMEL_BOUNDARY = Pattern.compile(
        "(?<=[a-z0-9])(?=[A-Z])"
    );

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
        entry("contact.contact.secondaryEmail", AutofillPolicy.CONDITIONAL),
        entry("contact.contact.phoneNumber", AutofillPolicy.ALLOWED),
        entry("contact.contact.emergencyPhoneNumber", AutofillPolicy.CONDITIONAL),
        entry("contact.contact.residenceCountry", AutofillPolicy.CONDITIONAL),
        entry("education.highSchool.academicProcess", AutofillPolicy.CONDITIONAL),
        entry("education.highSchool.schoolName", AutofillPolicy.CONDITIONAL),
        entry("education.highSchool.completionStatus", AutofillPolicy.CONDITIONAL),
        entry("education.highSchool.schoolRegion", AutofillPolicy.CONDITIONAL),
        entry("education.highSchool.startDate", AutofillPolicy.ALLOWED),
        entry("education.highSchool.endDate", AutofillPolicy.ALLOWED),
        entry("education.university.degreeLevel", AutofillPolicy.CONDITIONAL),
        entry("education.university.latestEducationType", AutofillPolicy.CONDITIONAL),
        entry("education.university.schoolName", AutofillPolicy.CONDITIONAL),
        entry("education.university.attendanceType", AutofillPolicy.CONDITIONAL),
        entry("education.university.schoolRegion", AutofillPolicy.CONDITIONAL),
        entry("education.university.startDate", AutofillPolicy.ALLOWED),
        entry("education.university.endDate", AutofillPolicy.ALLOWED),
        entry("education.university.completionStatus", AutofillPolicy.CONDITIONAL),
        entry("education.university.gpaScore", AutofillPolicy.ALLOWED),
        entry("education.university.gpaScale", AutofillPolicy.CONDITIONAL),
        entry("education.university.totalCredits", AutofillPolicy.ALLOWED),
        entry("education.university.majorName", AutofillPolicy.CONDITIONAL),
        entry("education.university.transferStatus", AutofillPolicy.CONDITIONAL),
        entry("education.university.doubleMajorStatus", AutofillPolicy.CONDITIONAL),
        entry("education.university.minorStatus", AutofillPolicy.CONDITIONAL),
        entry("education.university.minorName", AutofillPolicy.CONDITIONAL),
        entry("education.university.additionalMajorName", AutofillPolicy.CONDITIONAL),
        entry("education.graduateSchool.degreeLevel", AutofillPolicy.CONDITIONAL),
        entry("education.graduateSchool.country", AutofillPolicy.CONDITIONAL),
        entry("education.graduateSchool.schoolRegion", AutofillPolicy.CONDITIONAL),
        entry("education.graduateSchool.schoolName", AutofillPolicy.CONDITIONAL),
        entry("education.graduateSchool.attendanceType", AutofillPolicy.CONDITIONAL),
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
        entry("education.graduateSchool.labName", AutofillPolicy.ALLOWED),
        entry("education.graduateSchool.labProfessorName", AutofillPolicy.ALLOWED),
        entry("education.graduateSchool.thesisTitle", AutofillPolicy.ALLOWED),
        entry("education.graduateSchool.thesisSummary", AutofillPolicy.ALLOWED),
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
        entry("careers.career.companyName", AutofillPolicy.CONDITIONAL),
        entry("careers.career.employmentType", AutofillPolicy.ALLOWED),
        entry("careers.career.startDate", AutofillPolicy.ALLOWED),
        entry("careers.career.endDate", AutofillPolicy.ALLOWED),
        entry("careers.career.employmentStatus", AutofillPolicy.ALLOWED),
        entry("careers.career.department", AutofillPolicy.ALLOWED),
        entry("careers.career.position", AutofillPolicy.ALLOWED),
        entry("careers.career.responsibilities", AutofillPolicy.ALLOWED),
        entry("careers.career.terminationReason", AutofillPolicy.ALLOWED),
        entry("projects.project.startDate", AutofillPolicy.ALLOWED),
        entry("projects.project.endDate", AutofillPolicy.ALLOWED),
        entry("projects.project.projectName", AutofillPolicy.ALLOWED),
        entry("projects.project.role", AutofillPolicy.ALLOWED),
        entry("projects.project.activityDetails", AutofillPolicy.ALLOWED),
        entry("publications.publicationPatent.type", AutofillPolicy.CONDITIONAL),
        entry("publications.publicationPatent.title", AutofillPolicy.ALLOWED),
        entry("publications.publicationPatent.details", AutofillPolicy.ALLOWED),
        entry("compensation.compensation.desiredPosition", AutofillPolicy.ALLOWED),
        entry("compensation.compensation.desiredSalary", AutofillPolicy.ALLOWED),
        entry("compensation.compensation.previousSalary", AutofillPolicy.ALLOWED),
        entry("military.military.militaryStatus", AutofillPolicy.ALLOWED),
        entry("military.military.militaryType", AutofillPolicy.ALLOWED),
        entry("military.military.militaryBranch", AutofillPolicy.ALLOWED),
        entry("military.military.militarySpecialty", AutofillPolicy.ALLOWED),
        entry("military.military.militaryRank", AutofillPolicy.ALLOWED),
        entry("military.military.serviceStartDate", AutofillPolicy.ALLOWED),
        entry("military.military.serviceEndDate", AutofillPolicy.ALLOWED),
        entry("military.military.dischargeType", AutofillPolicy.ALLOWED),
        entry("military.military.exemptionReason", AutofillPolicy.ALLOWED),
        entry("veteran.veteran.veteranStatus", AutofillPolicy.ALLOWED),
        entry("veteran.veteran.veteranType", AutofillPolicy.ALLOWED),
        entry("veteran.veteran.veteranRelation", AutofillPolicy.ALLOWED),
        entry("veteran.veteran.veteranNumber", AutofillPolicy.ALLOWED),
        entry("disability.disability.disabilityStatus", AutofillPolicy.ALLOWED),
        entry("disability.disability.disabilityType", AutofillPolicy.ALLOWED),
        entry("disability.disability.disabilityGrade", AutofillPolicy.ALLOWED),
        entry(
            "disability.disability.disabilityRegistrationNumber",
            AutofillPolicy.ALLOWED
        ),
        entry(
            "disability.disability.disabilityRegistrationDate",
            AutofillPolicy.ALLOWED
        ),
        entry("health.health.healthItemName", AutofillPolicy.ALLOWED),
        entry("health.health.healthStatusOrValue", AutofillPolicy.ALLOWED),
        entry("health.health.healthDate", AutofillPolicy.ALLOWED),
        entry("health.health.healthDetails", AutofillPolicy.ALLOWED)
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

    public String promptCatalog() {
        return keys().stream()
            .map(key -> key + " — " + canonicalMeaning(key))
            .reduce((left, right) -> left + "\n" + right)
            .orElse("");
    }

    public String promptGuidance() {
        return """
            Family name and given name are separate values; never split a full name.
            KOREAN_FULL_NAME is family name plus given name without a separator.
            English full-name recipes differ only by the explicit target order.
            Primary email differs from secondary email. Phone differs from emergency phone.
            Address line 1 is the base, street, road-name, or parcel address. Address
            line 2 is the detail, remainder, or remaining address. Never map explicit
            address-line-2 evidence to address line 1, or the reverse.
            Education dates and fields belong to the high-school, university, or
            graduate-school record named in the canonical key; do not cross record types.
            GPA score, GPA scale, and total credits are different numeric meanings.
            Language-test registration number and certificate registration number differ.
            Start and end dates belong to the record category named in the canonical key.
            Generic activity dates or details are projects only with explicit project context.
            Unsupported volunteer, extracurricular, award, contest, and overseas-experience
            sections are not projects. Omit their candidates because the profile has no
            corresponding category.
            Status, type, branch, specialty, rank, number, relation, and reason are distinct.
            Omit a candidate when these boundaries or its repeated-row meaning are unclear.
            """;
    }

    private static String canonicalMeaning(String key) {
        String[] parts = key.split("\\.");
        return "category " + words(parts[0])
            + ", record " + words(parts[1])
            + ", field " + words(parts[2]);
    }

    private static String words(String camelCase) {
        return CAMEL_BOUNDARY.matcher(camelCase)
            .replaceAll(" ")
            .toLowerCase(Locale.ROOT);
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
