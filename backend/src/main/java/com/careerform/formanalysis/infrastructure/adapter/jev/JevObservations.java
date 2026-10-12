package com.careerform.formanalysis.infrastructure.adapter.jev;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.infrastructure.adapter.ProviderFormText;
import com.careerform.formanalysis.infrastructure.adapter.ProviderSemanticSanitizer;

final class JevObservations {
    private static final int MAX_OPTIONS = 128;
    private JevObservations() {}
    static Map<String, Object> field(String section, int row, FieldsAnalysisRequest.FieldCandidate field) {
        Map<String, Object> result = new LinkedHashMap<>();
        text(result, "section", ProviderFormText.project(section));
        result.put("rowIndex", row);
        text(result, "label", field.element() == FieldsAnalysisRequest.FormElement.CUSTOM
            ? ProviderSemanticSanitizer.sanitize(field.displayName())
            : ProviderFormText.project(field.displayName()));
        text(result, "placeholder", ProviderFormText.project(field.placeholder()));
        result.put("element", field.element());
        result.put("control", field.control());
        result.put("visibility", field.visibility());
        result.put("disabled", Boolean.TRUE.equals(field.disabled()));
        result.put("readonly", Boolean.TRUE.equals(field.readonly()));
        result.put("inert", Boolean.TRUE.equals(field.inert()));
        if (field.semanticContext() != null) {
            var context = field.semanticContext();
            var labels = ProviderFormText.projectFields(context.labels());
            if (labels != null) result.put("labels", labels);
            if (context.inputType() != null) result.put("inputType", context.inputType());
            if (context.autocomplete() != null) result.put("autocomplete", context.autocomplete());
            if (context.repeat() != null) result.put("repeat", Map.of(
                "rowIndex", context.repeat().rowIndex(), "rowCount", context.repeat().rowCount()));
        }
        if (field.options() != null) {
            result.put("options", field.options().stream()
                .map(option -> ProviderFormText.project(option.displayName()))
                .filter(Objects::nonNull)
                .limit(MAX_OPTIONS)
                .toList());
        }
        return result;
    }
    static Map<String, Object> action(String section, int row, PreparationAnalysisRequest.ActionCandidate action) {
        Map<String, Object> result = new LinkedHashMap<>();
        text(result, "section", ProviderFormText.project(section));
        result.put("rowIndex", row);
        text(result, "label", action.element() == PreparationAnalysisRequest.FormElement.CUSTOM
            ? ProviderSemanticSanitizer.sanitize(action.displayName())
            : ProviderFormText.project(action.displayName()));
        result.put("element", action.element());
        result.put("control", action.control());
        result.put("visibility", action.visibility());
        result.put("disabled", Boolean.TRUE.equals(action.disabled()));
        result.put("readonly", Boolean.TRUE.equals(action.readonly()));
        result.put("inert", Boolean.TRUE.equals(action.inert()));
        if (action.semanticContext() != null) {
            var labels = ProviderFormText.projectActions(action.semanticContext().labels());
            if (labels != null) result.put("labels", labels);
        }
        return result;
    }
    static boolean conflicts(String key, Map<String, Object> observation) {
        StringBuilder evidence = new StringBuilder();
        classifyAll(evidence, observation);
        return conflicts(key, evidence.toString());
    }
    private static boolean conflicts(String key, String evidence) {
        return ("contact.contact.addressLine1".equals(key) && evidence.contains("address line 2"))
            || ("contact.contact.addressLine2".equals(key) && evidence.contains("address line 1"))
            || (key.startsWith("projects.project.") && List.of("unsupported volunteer activity",
                "unsupported extracurricular activity", "unsupported award history",
                "unsupported overseas experience").stream().anyMatch(evidence::contains));
    }
    private static void classifyAll(StringBuilder target, Object value) {
        if (value instanceof String text) {
            String classified = ProviderSemanticSanitizer.sanitize(text);
            if (classified != null) target.append(';').append(classified);
        } else if (value instanceof ProviderFormText.Label label) {
            classifyAll(target, label.text());
        } else if (value instanceof Iterable<?> values) {
            values.forEach(item -> classifyAll(target, item));
        } else if (value instanceof Map<?, ?> values) {
            values.values().forEach(item -> classifyAll(target, item));
        }
    }
    private static void text(Map<String, Object> target, String key, String value) {
        if (value != null) target.put(key, value);
    }
}
