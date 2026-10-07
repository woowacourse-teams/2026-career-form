package com.careerform.formanalysis.infrastructure.adapter.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;

import com.careerform.monitoring.ExternalCallMetrics;
import com.careerform.quality.QualityAiObserver;
import com.careerform.quality.QualityScope;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import tools.jackson.databind.ObjectMapper;

class OpenAiQualityObservationTest {
    @Test
    void observesSdkCallWithModelMetadataWithoutStoringModelText() {
        try (var scope = QualityScope.open()) {
            client().generate("synthetic prompt", new Input("synthetic"), Output.class);
            assertThat(scope.calls()).hasSize(1);
            assertThat(scope.calls().getFirst().modelVersion()).matches("[0-9a-f]{64}");
        }
    }

    @Test
    void doesNotCountFailureBeforeSdkCallAsAiInvocation() {
        try (var scope = QualityScope.open()) {
            assertThatThrownBy(() -> client().generate("synthetic", new Input("synthetic"), Output.class,
                schema -> { throw new IllegalArgumentException("synthetic schema failure"); })).isInstanceOf(RuntimeException.class);
            assertThat(scope.calls()).isEmpty();
        }
    }

    private OpenAiClient client() {
        ChatModel model = prompt -> new ChatResponse(List.of(new Generation(new AssistantMessage("{\"schemaVersion\":2}"))),
            ChatResponseMetadata.builder().model("gpt-synthetic").build());
        return new OpenAiClient(ChatClient.builder(model), new ObjectMapper(), null,
            new ExternalCallMetrics(new SimpleMeterRegistry(), Optional.of(new QualityAiObserver())), null, "gpt-synthetic");
    }

    private record Input(String state) {}
    private record Output(int schemaVersion) {}
}
