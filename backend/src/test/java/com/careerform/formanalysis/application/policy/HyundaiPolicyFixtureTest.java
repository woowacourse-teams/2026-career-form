package com.careerform.formanalysis.application.policy;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class HyundaiPolicyFixtureTest {

    @Test
    void hyundaiFixtureContainsStructureOnlyAndNoPersonalValues() throws IOException {
        String fields = read("formanalysis/hyundai-fields-current-v1.json");
        String preparation = read("formanalysis/hyundai-preparation-current-v1.json");

        assertThat(fields).contains("talent.hyundai.com", "engNm", "schNm_1");
        assertThat(preparation).contains("talent.hyundai.com", "applyWrite.hc");
        assertThat(fields + preparation)
            .contains("milCd")
            .doesNotContain("한승규", "@", "4265e0619f340f21", "session", "token");
    }

    private static String read(String path) throws IOException {
        return new ClassPathResource(path).getContentAsString(StandardCharsets.UTF_8);
    }
}
