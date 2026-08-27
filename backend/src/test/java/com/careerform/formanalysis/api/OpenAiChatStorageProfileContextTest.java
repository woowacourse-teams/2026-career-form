package com.careerform.formanalysis.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.ai.model.openai.autoconfigure.OpenAiChatProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=false",
    "career-form.llm.provider=",
    "career-form.llm.model=",
    "spring.ai.openai.api-key="
})
abstract class OpenAiChatStorageProfileContextTest {

    @Autowired
    private OpenAiChatProperties openAiChatProperties;

    @Test
    @DisplayName("공통 Chat Completion 저장 설정을 상속한다")
    void inheritsChatCompletionStorage() {
        assertThat(openAiChatProperties.getStore()).isTrue();
    }
}

@ActiveProfiles("local")
@DisplayName("local Chat Completion 저장 설정")
class LocalOpenAiChatStorageProfileContextTest
    extends OpenAiChatStorageProfileContextTest {
}

@ActiveProfiles("dev")
@DisplayName("dev Chat Completion 저장 설정")
class DevOpenAiChatStorageProfileContextTest
    extends OpenAiChatStorageProfileContextTest {
}

@ActiveProfiles("staging")
@DisplayName("staging Chat Completion 저장 설정")
class StagingOpenAiChatStorageProfileContextTest
    extends OpenAiChatStorageProfileContextTest {
}

@ActiveProfiles("prod")
@DisplayName("prod Chat Completion 저장 설정")
class ProdOpenAiChatStorageProfileContextTest
    extends OpenAiChatStorageProfileContextTest {
}
