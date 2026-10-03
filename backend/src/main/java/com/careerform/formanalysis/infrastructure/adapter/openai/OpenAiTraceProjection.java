package com.careerform.formanalysis.infrastructure.adapter.openai;

import java.util.LinkedHashMap;
import java.util.Map;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.infrastructure.adapter.ProviderTraceProjection;
import com.openai.models.completions.CompletionUsage;
import org.springframework.ai.chat.model.ChatResponse;
import tools.jackson.databind.json.JsonMapper;

final class OpenAiTraceProjection {
    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private static final SupportedProfileFields FIELDS = new SupportedProfileFields();
    private final ProviderTraceProjection values = new ProviderTraceProjection();
    private final Map<String, Object> inputs;
    private final boolean supported;

    OpenAiTraceProjection(String prompt, Object input, Class<?> outputType, String json) {
        String expected = expectedPrompt(input, outputType);
        if (expected == null) {
            inputs = Map.of("projection", "UNSUPPORTED_INPUT");
            supported = false;
        } else if (!expected.equals(prompt)) {
            inputs = Map.of("projection", "UNRECOGNIZED_PROMPT");
            supported = false;
        } else if (json.length() > ProviderTraceProjection.MAX_JSON_CHARS) {
            inputs = Map.of("system", expected, "projection", "INPUT_LIMIT");
            supported = false;
        } else {
            var tree = MAPPER.readTree(json);
            values.collectIdentifiers(tree);
            inputs = Map.of("system", expected, "user", values.object(tree));
            supported = true;
        }
    }

    Map<String, Object> inputs() { return inputs; }

    Map<String, Object> output(String json, ChatResponse response, String requestedModel) {
        if (!supported) return Map.of("projection", "UNSUPPORTED_OUTPUT");
        if (json.length() > ProviderTraceProjection.MAX_JSON_CHARS) return Map.of("projection", "OUTPUT_LIMIT");
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("result", values.object(MAPPER.readTree(json)));
        if (response.getMetadata() != null) {
            String model = response.getMetadata().getModel();
            if (model != null && !model.isBlank()) output.put("model", requestedModel.equals(model) ? requestedModel : "UNRECOGNIZED_MODEL");
        }
        return Map.copyOf(output);
    }

    static Map<String, Number> usage(ChatResponse response) {
        if (response == null || response.getMetadata() == null || response.getMetadata().getUsage() == null
            || !(response.getMetadata().getUsage().getNativeUsage() instanceof CompletionUsage nativeUsage)) return Map.of();
        Map<String, Number> usage = new LinkedHashMap<>();
        nativeUsage._promptTokens().asKnown().filter(value -> value >= 0).ifPresent(value -> usage.put("input_tokens", value));
        nativeUsage._completionTokens().asKnown().filter(value -> value >= 0).ifPresent(value -> usage.put("output_tokens", value));
        nativeUsage._totalTokens().asKnown().filter(value -> value >= 0).ifPresent(value -> usage.put("total_tokens", value));
        return Map.copyOf(usage);
    }

    private static String expectedPrompt(Object input, Class<?> outputType) {
        if (input instanceof OpenAiActionResolver.ActionInput && outputType == OpenAiActionResolver.ActionOutput.class)
            return OpenAiActionResolver.SYSTEM_PROMPT;
        if (input instanceof OpenAiFieldMappingResolver.FieldInput && outputType == OpenAiFieldMappingResolver.FieldOutput.class)
            return OpenAiFieldMappingResolver.SYSTEM_PROMPT.formatted(FIELDS.promptCatalog(), FIELDS.promptGuidance());
        if (input instanceof InteractionDecisionProvider.Batch && outputType == OpenAiInteractionDecisionProvider.ProviderOutput.class)
            return OpenAiInteractionDecisionProvider.SYSTEM_PROMPT;
        return null;
    }
}
