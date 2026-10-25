package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.regex.Pattern;

import org.bson.Document;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Pins what Greeting v19 changes against the shipped v18 snapshot, and nothing else. */
@DisplayName("startup seed 그리팅 v19")
class StartupPolicySeedGreetingV19Test {
    private final Document seed = new StartupPolicySeed().document();

    private Document greeting(long version) {
        return seed.getList("policies", Document.class).stream()
            .filter(p -> "greeting".equals(p.getString("companyKey")) && p.get("version", Number.class).longValue() == version)
            .findFirst().orElseThrow();
    }

    private static String directSearch(Document policy) {
        return policy.get("executionPolicy", Document.class)
            .get("componentPolicy", Document.class)
            .get("patterns", Document.class)
            .getString("directSearch");
    }

    @Test
    @DisplayName("v19는 v18에서 직접 입력 검색 패턴 하나만 바꾸고 활성 버전이 된다")
    void changesOnlyTheDirectSearchPattern() {
        var v18 = greeting(18);
        var v19 = greeting(19);
        assertThat(v19.getString("_id")).isEqualTo("greeting-policy-v19");
        for (var key : List.of("preparationFingerprint", "fieldsFingerprint", "actionRules", "fieldRules", "_class"))
            assertThat(v19.get(key)).as(key).isEqualTo(v18.get(key));
        assertThat(directSearch(v19)).isNotEqualTo(directSearch(v18));
        var expected = Document.parse(v18.get("executionPolicy", Document.class).toJson());
        expected.get("componentPolicy", Document.class).get("patterns", Document.class).put("directSearch", directSearch(v19));
        assertThat(v19.get("executionPolicy", Document.class)).isEqualTo(expected);
        assertThat(seed.getList("companies", Document.class).stream()
            .filter(c -> "greeting".equals(c.getString("companyKey")))
            .map(c -> c.get("activePolicyVersion", Number.class).longValue()))
            .containsExactly(19L);
    }

    @Test
    @DisplayName("직접 입력은 학교명·전공명·회사명·자격증명에만 허용되고 시험명·국적·전공 구분에는 허용되지 않는다")
    void directSearchCoversSchoolsMajorsCompaniesAndCredentialsOnly() {
        var pattern = Pattern.compile(directSearch(greeting(19)));
        for (var name : List.of(
            "educationalBackground.highSchool.schoolName",
            "educationalBackground.universities.0.schoolName",
            "educationalBackground.universities.1.majors.0",
            "educationalBackground.graduateSchools.0.schoolName",
            "educationalBackground.graduateSchools.0.majors.2",
            "workHistory.workExperiences.1.companyName",
            "languagesCertificationsAndOtherActivity.certificatesLicenses.0.credentials"))
            assertThat(pattern.matcher(name).find()).as(name).isTrue();
        for (var name : List.of(
            "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.testName",
            "basicInformation.nationalityCode",
            "educationalBackground.universities.0.majors.2.majorClassification",
            "educationalBackground.universities.0.majors.2.majorField",
            "educationalBackground.universities.0.gpa.score"))
            assertThat(pattern.matcher(name).find()).as(name).isFalse();
        var v18 = Pattern.compile(directSearch(greeting(18)));
        assertThat(v18.matcher("educationalBackground.universities.0.majors.2").find()).isFalse();
        assertThat(v18.matcher("educationalBackground.universities.0.schoolName").find()).isFalse();
    }
}
