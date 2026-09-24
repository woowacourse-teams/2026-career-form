package com.careerform.formanalysis.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.ai.model.openai.autoconfigure.OpenAiCommonProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=true",
    "spring.ai.openai.api-key=synthetic-test-key",
    "spring.ai.openai.chat.model=gpt-5.6-luna"
})
@Import({
    FormAnalysisEnabledProviderApiTest.FakeProviderConfiguration.class,
    NotRegisteredPolicyConfiguration.class
})
class FormAnalysisDefaultTimeoutBindingTest {

    @Autowired
    private OpenAiCommonProperties openAiCommonProperties;

    @Test
    void bindsDefaultTimeoutFromLoadedApplicationConfiguration() {
        assertThat(openAiCommonProperties.getTimeout()).isEqualTo(Duration.ofSeconds(30));
    }
}

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=true",
    "CAREER_FORM_LLM_TIMEOUT=41s",
    "spring.ai.openai.api-key=synthetic-test-key",
    "spring.ai.openai.chat.model=gpt-5.6-luna"
})
@Import({
    FormAnalysisEnabledProviderApiTest.FakeProviderConfiguration.class,
    NotRegisteredPolicyConfiguration.class
})
class FormAnalysisEnvironmentTimeoutBindingTest {

    @Autowired
    private OpenAiCommonProperties openAiCommonProperties;

    @Test
    void bindsCareerFormLlmTimeoutFromLoadedApplicationConfiguration() {
        assertThat(openAiCommonProperties.getTimeout()).isEqualTo(Duration.ofSeconds(41));
    }
}
