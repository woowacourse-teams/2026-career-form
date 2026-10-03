package com.careerform.formanalysis.infrastructure.adapter;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.dto.InteractionDecisionRequest;
import tools.jackson.databind.JsonNode;

/** Closed trace vocabulary. No original identifier or arbitrary text is returned. */
public final class ProviderTraceProjection {
    public static final int MAX_JSON_CHARS = 32_768;
    private static final Set<String> CONTAINERS = Set.of("sections", "fields", "actionCandidates", "items", "options",
        "labels", "decisions", "candidates", "matches", "revealSections", "addRepeatableGroups", "noActions",
        "selections", "abstentions", "semanticContext", "repeat", "valueBinding", "structure", "calendarStructure");
    private static final Set<String> TEXT = Set.of("displayName", "label", "placeholder", "section", "text");
    private static final Set<String> FLAGS = Set.of("disabled", "readonly", "inert", "required", "multiple");
    private static final Set<String> INTERACTION_TERMS = Set.of("school name", "university", "graduate school", "high school",
        "search", "input", "select", "confirm", "submit");
    private static final Map<String, Set<String>> ENUMS = Map.ofEntries(
        Map.entry("element", Set.of("input", "select", "textarea", "button", "custom", "link")),
        Map.entry("control", Set.of("text", "select", "radio", "checkbox", "textarea", "button", "custom", "search", "submit", "container", "item")),
        Map.entry("visibility", Set.of("visible", "hidden")),
        Map.entry("source", Set.of("label", "aria-label", "aria-labelledby", "placeholder", "legend", "section-heading", "description", "title")),
        Map.entry("inputType", Set.of("text", "email", "tel", "number", "date", "month", "url", "search")),
        Map.entry("inputMode", Set.of("none", "text", "decimal", "numeric", "tel", "search", "email", "url")),
        Map.entry("autocomplete", Set.of("name", "given-name", "family-name", "additional-name", "email", "tel", "postal-code", "street-address", "address-line1", "address-line2", "country", "country-name", "bday", "bday-day", "bday-month", "bday-year", "organization", "organization-title", "off")),
        Map.entry("relationToTarget", Set.of("TARGET_CONTROL", "SAME_FIELD_GROUP", "SAME_REPEAT_ROW", "SAME_CONTAINER", "DIALOG_CONTROL")),
        Map.entry("type", Set.of("DIRECT", "DERIVED")),
        Map.entry("recipe", Set.of("KOREAN_FULL_NAME", "ENGLISH_FULL_NAME_GIVEN_FIRST", "ENGLISH_FULL_NAME_FAMILY_FIRST")),
        Map.entry("tag", Set.of("div", "li", "span", "ul", "ol", "table", "tbody", "tr", "td", "button", "a", "input", "img", "select")),
        Map.entry("ariaRole", Set.of("none", "list", "listbox", "row", "listitem", "option", "button")),
        Map.entry("activation", Set.of("none", "native", "inline-click", "keyboard", "click", "focus", "change")),
        Map.entry("ownership", Set.of("linked-popup", "single-field", "adjacent-trigger", "bound-target")),
        Map.entry("unit", Set.of("month", "day")),
        Map.entry("unitEvidence", Set.of("target-format", "target-label", "month-options")),
        Map.entry("valueShape", Set.of("none", "year-options", "month-options", "day-grid", "previous", "next", "apply"))
    );
    private final Map<String, Map<String, String>> aliases = new LinkedHashMap<>();
    private int remaining = 4096;

    public void collectIdentifiers(JsonNode node) {
        collect(node, 0);
    }

    private void collect(JsonNode node, int depth) {
        if (depth > 12 || remaining-- <= 0) return;
        if (node.isArray()) {
            int count = 0;
            for (JsonNode child : node) {
                if (count++ == 128) break;
                collect(child, depth + 1);
            }
        } else if (node.isObject()) {
            for (var property : node.properties()) {
                String key = property.getKey();
                if (identifierKind(key) != null && !key.equals("parentSectionId") && !key.equals("targetSectionId")
                    && property.getValue().isString()) register(key, property.getValue().asString());
                if (CONTAINERS.contains(key)) collect(property.getValue(), depth + 1);
            }
        }
    }

    public String register(String key, String raw) {
        String kind = identifierKind(key);
        if (kind == null || raw == null || raw.length() > 128) return "UNKNOWN_REFERENCE";
        Map<String, String> group = aliases.computeIfAbsent(kind, ignored -> new LinkedHashMap<>());
        if (group.size() >= 512 && !group.containsKey(raw)) return "UNKNOWN_REFERENCE";
        return group.computeIfAbsent(raw, ignored -> kind + "_" + group.size());
    }

    public String reference(String key, String raw) {
        return aliases.getOrDefault(identifierKind(key), Map.of()).getOrDefault(raw, "UNKNOWN_REFERENCE");
    }

    public Map<String, Object> object(JsonNode node) {
        remaining = 4096;
        return object(node, 0);
    }

    private Map<String, Object> object(JsonNode node, int depth) {
        if (!node.isObject() || depth > 12 || remaining-- <= 0) return Map.of("projection", "STRUCTURE_LIMIT");
        Map<String, Object> result = new LinkedHashMap<>();
        for (var property : node.properties()) {
            if (remaining <= 0) { result.put("projection", "STRUCTURE_LIMIT"); break; }
            String key = property.getKey();
            JsonNode value = property.getValue();
            if (value.isNull()) continue;
            if (CONTAINERS.contains(key)) {
                if (value.isObject()) result.put(key, object(value, depth + 1));
                else if (value.isArray()) {
                    List<Object> values = new ArrayList<>();
                    for (JsonNode child : value) {
                        if (values.size() == 128 || remaining <= 0) break;
                        if (child.isObject()) values.add(object(child, depth + 1));
                        else if (key.equals("options") && child.isString()) values.add(semantic(child.asString()));
                    }
                    result.put(key, List.copyOf(values));
                    if (value.size() > values.size()) result.put("projection", "STRUCTURE_LIMIT");
                }
            } else if (identifierKind(key) != null && value.isString()) result.put(key, reference(key, value.asString()));
            else if (TEXT.contains(key) && value.isString()) result.put(key, semantic(value.asString()));
            else if (FLAGS.contains(key) && value.isBoolean()) result.put(key, value.asBoolean());
            else if ((key.equals("profileFieldKey") || key.equals("canonicalFieldKey")) && value.isString())
                result.put(key, canonical(value.asString()));
            else if (key.equals("role") && value.isString()) result.put(key, role(value.asString()));
            else if (ENUMS.containsKey(key) && value.isString())
                result.put(key, ENUMS.get(key).contains(value.asString()) ? value.asString() : "UNRECOGNIZED_VALUE");
            else if (value.isIntegralNumber() && validNumber(key, value.asLong())) result.put(key, value.asLong());
        }
        return Map.copyOf(result);
    }

    public static String semantic(String value) {
        if (value == null || value.length() > 512) return "UNRECOGNIZED_TEXT";
        if (ProviderSemanticSanitizer.isSanitized(value)) return value;
        String[] terms = value.split("; ", -1);
        return terms.length <= 6 && java.util.Arrays.stream(terms).allMatch(INTERACTION_TERMS::contains)
            ? value : "UNRECOGNIZED_TEXT";
    }

    public static String canonical(String value) {
        return new SupportedProfileFields().contains(value) ? value : "UNKNOWN_REFERENCE";
    }

    public static String role(String value) {
        for (var role : InteractionDecisionRequest.Role.values()) if (role.name().equals(value)) return role.name();
        return "UNRECOGNIZED_ROLE";
    }

    private static String identifierKind(String key) {
        return switch (key) {
            case "snapshotId" -> "snapshot";
            case "sectionId", "parentSectionId", "targetSectionId" -> "section";
            case "candidateId" -> "candidate";
            case "decisionId" -> "decision";
            case "itemId" -> "item";
            case "itemGroupId", "groupId" -> "group";
            default -> null;
        };
    }

    private static boolean validNumber(String key, long value) {
        return switch (key) {
            case "schemaVersion" -> value == 2;
            case "rowIndex" -> value >= -1 && value <= 127;
            case "rowCount" -> value >= 1 && value <= 128;
            case "maxLength" -> value >= 1 && value <= 100_000;
            case "depth" -> value >= 0 && value <= 6;
            case "childCount" -> value >= 0 && value <= 24;
            default -> false;
        };
    }
}
