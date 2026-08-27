package com.careerform.formanalysis.application.policy;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

import tools.jackson.databind.ObjectMapper;

@DisplayName("저장된 회사 정책 fingerprint")
class StoredPolicyFingerprintTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final StoredPolicyFingerprint fingerprint = new StoredPolicyFingerprint();
    private final CompanyFormPolicy policy = CompanyFormPolicyFixture.sk();

    @Test
    @DisplayName("정책의 필수 section과 control tuple이 모두 있으면 일치한다")
    void matchesVerifiedPreparationAndFieldsSnapshots() throws Exception {
        assertThat(fingerprint.matches(
            policy,
            preparation("sk-preparation-snapshot-a-v2.json")
        )).isTrue();
        assertThat(fingerprint.matches(
            policy,
            fields("sk-fields-snapshot-b-v2.json")
        )).isTrue();
    }

    @Test
    @DisplayName("필수 structure가 없거나 이름이 바뀌면 일치하지 않는다")
    void rejectsMismatchedPreparationAndFieldsSnapshots() throws Exception {
        assertThat(fingerprint.matches(
            policy,
            preparation("sk-preparation-structure-mismatch-v2.json")
        )).isFalse();
        assertThat(fingerprint.matches(
            policy,
            fields("sk-fields-structure-mismatch-v2.json")
        )).isFalse();
    }

    private PreparationAnalysisRequest preparation(String name) throws Exception {
        return objectMapper.readValue(fixture(name), PreparationAnalysisRequest.class);
    }

    private FieldsAnalysisRequest fields(String name) throws Exception {
        return objectMapper.readValue(fixture(name), FieldsAnalysisRequest.class);
    }

    private static String fixture(String name) throws Exception {
        return new ClassPathResource("formanalysis/" + name)
            .getContentAsString(StandardCharsets.UTF_8);
    }
}
