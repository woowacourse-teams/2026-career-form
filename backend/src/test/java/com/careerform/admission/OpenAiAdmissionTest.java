package com.careerform.admission;

import static org.assertj.core.api.Assertions.assertThat;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.mongodb.client.MongoClients;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiClient;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import tools.jackson.databind.ObjectMapper;

@EnabledIfEnvironmentVariable(named = "ANALYSIS_TEST_MONGO_URI", matches = "mongodb://127\\.0\\.0\\.1:[0-9]+")
class OpenAiAdmissionTest {
    @Test
    void openAiUsesCommonExecutionAndDisablesUncountedSdkRetries() throws Exception {
        try (var client = MongoClients.create(System.getenv("ANALYSIS_TEST_MONGO_URI"))) {
            var mongo = new MongoTemplate(client, "cf359_test_" + UUID.randomUUID().toString().replace("-", ""));
            var settings = AdmissionSettings.defaults();
            var gate = new ExecutionGate(1, 1, settings.queueWait());
            var meters = new SimpleMeterRegistry();
            var admission = new AiAdmission(new UsageLedger(new MongoUsageStore(mongo), Clock.systemUTC(), settings), gate, settings, meters);
            ChatModel model = new ChatModel() {
                @Override public org.springframework.ai.chat.prompt.ChatOptions getOptions() {
                    return OpenAiChatOptions.builder().build();
                }
                @Override public ChatResponse call(org.springframework.ai.chat.prompt.Prompt prompt) {
                    assertThat(gate.active()).isEqualTo(1);
                    var options = (OpenAiChatOptions) prompt.getOptions();
                    assertThat(options.getMaxRetries()).isZero();
                    assertThat(options.getTimeout().toMillis()).isBetween(1L, 8000L);
                    return new ChatResponse(List.of(new Generation(new AssistantMessage("{\"value\":1}"))));
                }
            };
            var openai = new OpenAiClient(ChatClient.builder(model), new ObjectMapper());
            var field = OpenAiClient.class.getDeclaredField("admission");
            field.setAccessible(true);
            field.set(openai, admission);
            AnalysisContext.begin("synthetic-install", settings.requestTimeout());
            try {
                assertThat(openai.generate("synthetic", Map.of(), Output.class).value()).isEqualTo(1);
                assertThat(meters.counter("analysis.admission.transport.attempts").count()).isEqualTo(1);
                assertThat(mongo.findAll(UsageBucket.class).stream().filter(row -> row.id().startsWith("user:")).mapToInt(UsageBucket::used).sum()).isEqualTo(1);
            } finally { AnalysisContext.clear(); }
        }
    }
    record Output(int value) { }
}
