package com.careerform.formanalysis.generic;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.application.SupportedProfileFields;

@DisplayName("범용 섹션 분류 범주")
class SectionClassificationCategoriesTest {

    private final SupportedProfileFields fields = new SupportedProfileFields();
    private final SectionCategories categories = new SectionCategories(fields);

    @Test
    @DisplayName("범주 목록을 지원 프로필 키 접두사에서 생성한다")
    void derivesCategoryListFromSupportedProfileFieldPrefixes() {
        assertThat(categories.names()).containsExactlyInAnyOrder(
            "PERSONAL", "EDUCATION", "LANGUAGE", "CERTIFICATE", "CAREER", "PROJECT",
            "PUBLICATION", "COMPENSATION", "SENSITIVE", "NONE", "MIXED", "ABSTAIN");
    }

    @Test
    @DisplayName("health 접두사 키는 NONE, 병역·보훈·장애는 SENSITIVE, 연락처는 PERSONAL로 묶는다")
    void groupsPrefixesIntoIssueCategories() {
        assertThat(fields.keys().stream().filter(key -> key.startsWith("health."))
            .map(SectionCategories::categoryOf).collect(Collectors.toSet())).containsExactly("NONE");
        assertThat(Set.of("military.military.militaryStatus", "veteran.veteran.veteranStatus",
            "disability.disability.disabilityStatus").stream().map(SectionCategories::categoryOf)
            .collect(Collectors.toSet())).containsExactly("SENSITIVE");
        assertThat(SectionCategories.categoryOf("contact.contact.email")).isEqualTo("PERSONAL");
        assertThat(SectionCategories.categoryOf("certifications.certificate.name")).isEqualTo("CERTIFICATE");
        assertThat(SectionCategories.categoryOf("languages.languageSkill.language")).isEqualTo("LANGUAGE");
    }

    @Test
    @DisplayName("모든 지원 프로필 키가 생성된 범주 중 하나에 속한다")
    void everySupportedKeyBelongsToAGeneratedCategory() {
        assertThat(fields.keys()).allSatisfy(key ->
            assertThat(categories.names()).contains(SectionCategories.categoryOf(key)));
        assertThat(categories.keysOf("PERSONAL")).contains("contact.contact.phoneNumber", "personal.personal.birthDate");
        assertThat(categories.keysOf("MIXED")).isEmpty();
    }
}
