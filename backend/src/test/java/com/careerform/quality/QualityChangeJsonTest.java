package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class QualityChangeJsonTest {
    @Test
    void claimBodyMayOmitConfirmationOnlyProperties() {
        var change = JsonMapper.builder().build().readValue("{\"claimant\":\"합성 담당자\"}", QualityRegistryController.Change.class);
        assertThat(change.claimant()).isEqualTo("합성 담당자");
    }
}
