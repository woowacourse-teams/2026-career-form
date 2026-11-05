package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.bson.Document;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Pins what Hyundai v25 changes against the shipped v24 snapshot, and nothing else. */
@DisplayName("startup seed 현대 v25")
class StartupPolicySeedHyundaiV25Test {
    private static final String DIRECT = "com.careerform.formanalysis.application.port.FieldMappingResolver$DirectBinding";
    private static final String BUTTON = "com.careerform.formanalysis.application.port.FieldMappingResolver$ButtonOptionBinding";

    private final Document seed = new StartupPolicySeed().document();

    private Document hyundai(long version) {
        return seed.getList("policies", Document.class).stream()
            .filter(p -> "hyundai".equals(p.getString("companyKey")) && p.get("version", Number.class).longValue() == version)
            .findFirst().orElseThrow();
    }

    private static Map<String, Document> byName(Document policy) {
        return policy.getList("fieldRules", Document.class).stream()
            .collect(Collectors.toMap(r -> r.getString("structuralName") + "|" + r.getString("requiredItemGroupId"),
                Function.identity(), (a, b) -> a));
    }

    @Test
    @DisplayName("v25는 v24에서 경력 날짜 바인딩, 종료사유, 자격 등급 세 가지만 바꾼다")
    void changesOnlyTheThreeCareerAndLicenceRules() {
        var v24 = hyundai(24);
        var v25 = hyundai(25);
        assertThat(v25.getString("_id")).isEqualTo("hyundai-policy-v25");
        for (var key : List.of("preparationFingerprint", "fieldsFingerprint", "actionRules", "executionPolicy", "_class"))
            assertThat(v25.get(key)).as(key).isEqualTo(v24.get(key));
        assertThat(seed.getList("companies", Document.class).stream()
            .filter(c -> "hyundai".equals(c.getString("companyKey")))
            .map(c -> c.get("activePolicyVersion", Number.class).longValue()))
            .containsExactly(25L);

        var before = byName(v24);
        var after = byName(v25);
        assertThat(before).containsKey("retResEtcCont|null");
        assertThat(after).doesNotContainKey("retResEtcCont|null").containsKeys("retResCd|null", "grade|null");
        var unchanged = before.keySet().stream()
            .filter(k -> !List.of("retResEtcCont|null", "tranStartDt|null", "tranEndDt|null").contains(k)).toList();
        assertThat(unchanged).hasSize(before.size() - 3);
        for (var k : unchanged) assertThat(after.get(k)).as(k).isEqualTo(before.get(k));
        assertThat(after).hasSize(before.size() + 1);
    }

    @Test
    @DisplayName("경력 입사·퇴사연월일은 프로필 날짜를 그대로 쓰는 직접 바인딩이다")
    void careerDatesAreDirectBindings() {
        var after = byName(hyundai(25));
        for (var name : List.of("tranStartDt", "tranEndDt")) {
            var binding = after.get(name + "|null").get("valueBinding", Document.class);
            assertThat(binding.getString("_class")).as(name).isEqualTo(DIRECT);
            assertThat(binding.getString("profileFieldKey")).startsWith("careers.career.");
            assertThat(binding).doesNotContainKey("recipe");
        }
    }

    @Test
    @DisplayName("종료사유와 자격 등급은 선택지 코드가 모두 있고 별칭은 실제 선택지로만 향한다")
    void buttonRulesCarryEveryOptionCodeAndAliasesPointAtRealOptions() {
        var after = byName(hyundai(25));
        var reason = after.get("retResCd|null");
        assertThat(reason.getString("control")).isEqualTo("BUTTON");
        var reasonBinding = reason.get("valueBinding", Document.class);
        assertThat(reasonBinding.getString("_class")).isEqualTo(BUTTON);
        assertThat(reasonBinding.getString("profileFieldKey")).isEqualTo("careers.career.terminationReason");
        var reasonCodes = reasonBinding.get("optionCodeMap", Document.class);
        assertThat(reasonCodes).hasSize(16).containsEntry("계약만료", "G3").containsEntry("기타", "I4");
        var reasonOptions = reasonBinding.get("optionMap", Document.class);
        assertThat(reasonOptions).containsEntry("계약기간 만료", "계약만료");
        assertThat(reasonOptions.values()).allMatch(reasonCodes::containsKey);

        var grade = after.get("grade|null");
        // The trigger has no name attribute, so the rule is told apart from gradeForeLang by id only.
        assertThat(grade).doesNotContainKey("requiredDomName");
        var gradeBinding = grade.get("valueBinding", Document.class);
        assertThat(gradeBinding.getString("profileFieldKey")).isEqualTo("certifications.certificate.grade");
        var gradeCodes = gradeBinding.get("optionCodeMap", Document.class);
        assertThat(gradeCodes).hasSize(82).containsEntry("등급없음", "01").containsEntry("기사", "05");
        assertThat(gradeCodes.values().stream().distinct().count()).isEqualTo(82);
        assertThat(gradeBinding.get("optionMap", Document.class)).containsEntry("단일등급", "등급없음");
        // The language grade keeps its own rule; the trigger id (gradeForeLang_<n>) tells the two apart.
        assertThat(after.get("gradeForeLang|null").get("valueBinding", Document.class).getString("profileFieldKey"))
            .isEqualTo("languages.languageTest.grade");
    }
}
