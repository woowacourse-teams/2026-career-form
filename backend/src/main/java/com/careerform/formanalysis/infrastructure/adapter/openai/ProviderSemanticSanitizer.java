package com.careerform.formanalysis.infrastructure.adapter.openai;
import java.util.List;
/** Compatibility facade for existing OpenAI input records. */
final class ProviderSemanticSanitizer {
    private ProviderSemanticSanitizer() {}
    static String sanitize(String value) {
        return com.careerform.formanalysis.infrastructure.adapter.ProviderSemanticSanitizer.sanitize(value);
    }
    static List<SafeLabel> sanitizeFields(List<com.careerform.formanalysis.dto.FieldsAnalysisRequest.SemanticLabel> labels) {
        var safe = com.careerform.formanalysis.infrastructure.adapter.ProviderSemanticSanitizer.sanitizeFields(labels);
        return safe == null ? null : safe.stream().map(label -> new SafeLabel(label.source(), label.text())).toList();
    }
    static List<SafeLabel> sanitizeActions(List<com.careerform.formanalysis.dto.PreparationAnalysisRequest.SemanticLabel> labels) {
        var safe = com.careerform.formanalysis.infrastructure.adapter.ProviderSemanticSanitizer.sanitizeActions(labels);
        return safe == null ? null : safe.stream().map(label -> new SafeLabel(label.source(), label.text())).toList();
    }
    record SafeLabel(String source, String text) {}
}
