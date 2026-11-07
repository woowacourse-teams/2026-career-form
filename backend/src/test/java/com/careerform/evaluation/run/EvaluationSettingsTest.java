package com.careerform.evaluation.run;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class EvaluationSettingsTest {

    @Test
    void codeVersionPrefersTheShortCommitTheImageWasBuiltFrom() {
        assertThat(EvaluationSettings.codeVersion("391fbd8c0ffee0123456789abcdef0123456789a", "image@sha256:abc"))
            .isEqualTo("391fbd8");
    }

    @Test
    void codeVersionFallsBackWhenTheImageCarriesNoCommit() {
        assertThat(EvaluationSettings.codeVersion("", "391fbd8-dirty-c719195")).isEqualTo("391fbd8-dirty-c719195");
        assertThat(EvaluationSettings.codeVersion(" ", "image@sha256:abc")).isEqualTo("image@sha256:abc");
        assertThat(EvaluationSettings.codeVersion(null, "UNKNOWN")).isEqualTo("UNKNOWN");
    }
}
