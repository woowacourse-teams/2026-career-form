package com.careerform.formanalysis.infrastructure.adapter.jev;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.infrastructure.adapter.ProviderSemanticSanitizer;

final class JevObservations {
    private JevObservations() {}
    static Map<String, Object> field(String section, int row, FieldsAnalysisRequest.FieldCandidate field) {
        Map<String, Object> result = new LinkedHashMap<>();
        text(result, "section", section);
        result.put("rowIndex", row);
        text(result, "label", field.displayName());
        text(result, "placeholder", field.placeholder());
        result.put("element", field.element());
        result.put("control", field.control());
        result.put("visibility", field.visibility());
        result.put("disabled", Boolean.TRUE.equals(field.disabled()));
        result.put("readonly", Boolean.TRUE.equals(field.readonly()));
        result.put("inert", Boolean.TRUE.equals(field.inert()));
        if (field.semanticContext() != null) {
            var context = field.semanticContext();
            var labels = ProviderSemanticSanitizer.sanitizeFields(context.labels());
            if (labels != null) result.put("labels", labels);
            if (context.inputType() != null) result.put("inputType", context.inputType());
            if (context.autocomplete() != null) result.put("autocomplete", context.autocomplete());
            if (context.repeat() != null) result.put("repeat", Map.of(
                "rowIndex", context.repeat().rowIndex(), "rowCount", context.repeat().rowCount()));
        }
        if (field.options() != null) {
            List<String> options = new ArrayList<>();
            field.options().forEach(option -> {
                String value = ProviderSemanticSanitizer.sanitize(option.displayName());
                if (value != null) options.add(value);
            });
            result.put("options", options);
        }
        return result;
    }
    static Map<String, Object> action(String section, int row, PreparationAnalysisRequest.ActionCandidate action) {
        Map<String, Object> result = new LinkedHashMap<>();
        text(result, "section", section);
        result.put("rowIndex", row);
        text(result, "label", action.displayName());
        result.put("element", action.element());
        result.put("control", action.control());
        result.put("visibility", action.visibility());
        result.put("disabled", Boolean.TRUE.equals(action.disabled()));
        result.put("readonly", Boolean.TRUE.equals(action.readonly()));
        result.put("inert", Boolean.TRUE.equals(action.inert()));
        if (action.semanticContext() != null) {
            var labels = ProviderSemanticSanitizer.sanitizeActions(action.semanticContext().labels());
            if (labels != null) result.put("labels", labels);
        }
        return result;
    }
    static boolean conflicts(String key, Map<String, Object> observation) {
        String text = observation.toString();
        return ("contact.contact.addressLine1".equals(key) && text.contains("address line 2"))
            || ("contact.contact.addressLine2".equals(key) && text.contains("address line 1"))
            || (key.startsWith("projects.project.") && (text.contains("unsupported volunteer activity")
                || text.contains("unsupported extracurricular activity") || text.contains("unsupported award history")
                || text.contains("unsupported overseas experience")));
    }
    private static void text(Map<String, Object> target, String key, String raw) {
        String safe = ProviderSemanticSanitizer.sanitize(raw);
        if (safe != null) target.put(key, safe);
    }
}
