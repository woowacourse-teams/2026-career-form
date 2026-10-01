package com.careerform.formanalysis.infrastructure.adapter.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.InteractionDecisionRequest;
import com.careerform.formanalysis.exception.ResolverException;
import com.careerform.monitoring.tracing.LangSmithTraceRecorder;
import tools.jackson.databind.json.JsonMapper;

class OpenAiTracingTest {
    private static final String SECRET = "SYNTHETIC_PRIVATE_8421";

    @Test
    void preservesTrustedPromptAndFieldMeaningButAliasesIdentifiersAndRejectsOutputSecrets() {
        var recorder = recorder();
        var model = (ChatModel) prompt -> response("""
            {"schemaVersion":2,"snapshotId":"SYNTHETIC_PRIVATE_8421","matches":[
              {"candidateId":"SYNTHETIC_PRIVATE_8421-field","valueBinding":
                {"type":"DIRECT","profileFieldKey":"SYNTHETIC_PRIVATE_8421-output"}}]}
            """);
        var client = client(model, recorder);
        var input = OpenAiFieldMappingResolver.FieldInput.from(request());
        client.generate(OpenAiFieldMappingResolver.SYSTEM_PROMPT.formatted(
            new SupportedProfileFields().promptCatalog(), new SupportedProfileFields().promptGuidance()),
            input, OpenAiFieldMappingResolver.FieldOutput.class);

        var inputs = mapCaptor();
        verify(recorder).begin(eq("openai"), eq("FIELD"), eq("approved-model"), inputs.capture());
        var outputs = mapCaptor();
        verify(recorder).complete(any(), outputs.capture(), eq(Map.of()), isNull(), isNull());
        String wire = JsonMapper.builder().build().writeValueAsString(Map.of("inputs", inputs.getValue(), "outputs", outputs.getValue()));
        assertThat(wire).doesNotContain(SECRET).contains("contact.contact.email", "UNKNOWN_REFERENCE", "candidate_0");
        assertThat(inputs.getValue().get("system")).isEqualTo(OpenAiFieldMappingResolver.SYSTEM_PROMPT.formatted(
            new SupportedProfileFields().promptCatalog(), new SupportedProfileFields().promptGuidance()));
    }

    @Test
    void arbitraryPromptOrUnknownInputIsMetadataOnly() {
        var recorder = recorder();
        client(prompt -> response("{\"schemaVersion\":2,\"snapshotId\":\"x\",\"matches\":[]}"), recorder)
            .generate(SECRET, Map.of("text", SECRET), OpenAiFieldMappingResolver.FieldOutput.class);
        var inputs = mapCaptor();
        verify(recorder).begin(anyString(), anyString(), anyString(), inputs.capture());
        assertThat(inputs.getValue()).containsEntry("projection", "UNSUPPORTED_INPUT");
        assertThat(inputs.getValue().toString()).doesNotContain(SECRET);
    }

    @Test
    void interactionUsesAliasedDecisionsAndFiniteStructureWithoutInventingUsage() {
        var recorder = recorder();
        var input = new InteractionDecisionProvider.Batch(2, List.of(new InteractionDecisionProvider.Decision(
            SECRET, InteractionDecisionRequest.Role.SEARCH_QUERY_INPUT, "education.university.schoolName",
            List.of(new InteractionDecisionProvider.Candidate(SECRET + "-candidate", InteractionDecisionRequest.Element.INPUT,
                InteractionDecisionRequest.Control.SEARCH, InteractionDecisionRequest.Visibility.VISIBLE, false, false, false,
                InteractionDecisionRequest.RelationToTarget.DIALOG_CONTROL,
                List.of(new InteractionDecisionProvider.SemanticLabel("label", "school name; search")), false)))));
        var provider = new OpenAiInteractionDecisionProvider(client(prompt -> response("""
            {"schemaVersion":2,"selections":[],"abstentions":[{"decisionId":"SYNTHETIC_PRIVATE_8421","role":"SEARCH_QUERY_INPUT"}]}
            """), recorder));
        provider.decide(input);
        var inputs = mapCaptor();
        var outputs = mapCaptor();
        verify(recorder).begin(eq("openai"), eq("INTERACTION"), eq("approved-model"), inputs.capture());
        verify(recorder).complete(any(), outputs.capture(), eq(Map.of()), isNull(), isNull());
        assertThat(inputs.getValue().toString()).contains("school name; search", "decision_0").doesNotContain(SECRET);
        assertThat(outputs.getValue().toString()).contains("decision_0").doesNotContain(SECRET);
    }

    @Test
    void invalidResponseAndFailureMetadataNeverExportProviderText() {
        var recorder = recorder();
        assertThatThrownBy(() -> client(prompt -> response("{" + SECRET), recorder).generate(
            "synthetic", Map.of(), OpenAiFieldMappingResolver.FieldOutput.class)).isInstanceOf(ResolverException.class);
        verify(recorder).complete(any(), eq(Map.of()), eq(Map.of()), eq("INVALID_RESPONSE_DATA"), isNull());
    }

    private static FieldsAnalysisRequest request() {
        return new FieldsAnalysisRequest(2, SECRET, new FieldsAnalysisRequest.Site("synthetic.example", "/"),
            List.of(new FieldsAnalysisRequest.Section(SECRET + "-section", null, "이메일 " + SECRET,
                List.of(new FieldsAnalysisRequest.FieldCandidate(SECRET + "-field", FieldsAnalysisRequest.FormElement.INPUT,
                    FieldsAnalysisRequest.FormControl.TEXT, FieldsAnalysisRequest.Visibility.VISIBLE,
                    "이메일 " + SECRET, null, null, null, null, null, null, null)), null)));
    }

    private static LangSmithTraceRecorder recorder() {
        var recorder = mock(LangSmithTraceRecorder.class);
        when(recorder.begin(anyString(), anyString(), anyString(), anyMap())).thenReturn(mock(LangSmithTraceRecorder.Trace.class));
        return recorder;
    }

    private static OpenAiClient client(ChatModel model, LangSmithTraceRecorder recorder) {
        return new OpenAiClient(ChatClient.builder(model), JsonMapper.builder().build(), null, null, recorder, "approved-model");
    }

    private static ChatResponse response(String text) {
        return new ChatResponse(List.of(new Generation(new AssistantMessage(text))),
            ChatResponseMetadata.builder().model(SECRET).build());
    }

    private static ArgumentCaptor<Map<String, Object>> mapCaptor() {
        return ArgumentCaptor.captor();
    }
}
