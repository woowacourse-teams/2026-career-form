package com.careerform.notification;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** 공고와 구독이 고르는 직무 분류 정본. 기동 시 classpath의 JSON을 읽어 코드 형식·유일성과 라벨을 검증하고 실패하면 예외로 기동을 막는다. */
public final class JobCategories {
    static final String RESOURCE = "/notification/job-categories-v1.json";
    static final int MAX_LABEL_LENGTH = 40;
    private static final Pattern CODE = Pattern.compile("[A-Z][A-Z0-9_]{0,31}");
    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private final int version;
    private final List<Category> categories;
    private final Map<String, String> roleLabels;

    private JobCategories(int version, List<Category> categories, Map<String, String> roleLabels) {
        this.version = version;
        this.categories = List.copyOf(categories);
        this.roleLabels = Map.copyOf(roleLabels);
    }

    /** 대분류: 코드, 라벨, 소분류 목록. */
    public record Category(String code, String label, List<Role> roles) {
        public Category { roles = List.copyOf(roles); }
    }

    /** 소분류: `<대분류 코드>.<소분류 코드>` 형식의 코드와 라벨. */
    public record Role(String code, String label) { }

    public static JobCategories load() {
        try (var stream = JobCategories.class.getResourceAsStream(RESOURCE)) {
            if (stream == null) { throw new IllegalStateException("Job categories resource is missing: " + RESOURCE); }
            return parse(new String(stream.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException exception) {
            throw new IllegalStateException("Job categories resource is unreadable: " + RESOURCE, exception);
        }
    }

    public static JobCategories parse(String json) {
        JsonNode root;
        try {
            root = MAPPER.readTree(Objects.requireNonNull(json));
        } catch (JacksonException exception) {
            throw new IllegalStateException("Job categories JSON is malformed", exception);
        }
        if (!root.isObject()) { throw new IllegalStateException("Job categories root must be an object"); }
        var version = root.path("version");
        if (!version.isIntegralNumber() || !version.canConvertToInt() || version.intValue() < 1) {
            throw new IllegalStateException("Job categories version must be an integer of 1 or more");
        }
        var categoryNodes = root.path("categories");
        if (!categoryNodes.isArray() || categoryNodes.isEmpty()) { throw new IllegalStateException("Job categories must have at least one category"); }
        var codes = new HashSet<String>();
        var roleLabels = new LinkedHashMap<String, String>();
        var categories = new ArrayList<Category>();
        for (var categoryNode : categoryNodes) {
            var code = text(categoryNode, "code", "category");
            if (!CODE.matcher(code).matches()) { throw new IllegalStateException("Category code has an invalid format: " + code); }
            if (!codes.add(code)) { throw new IllegalStateException("Duplicate code: " + code); }
            var roleNodes = categoryNode.path("roles");
            if (!roleNodes.isArray() || roleNodes.isEmpty()) { throw new IllegalStateException("Category must have at least one role: " + code); }
            var roles = new ArrayList<Role>();
            for (var roleNode : roleNodes) {
                var roleCode = text(roleNode, "code", "role of " + code);
                if (!roleCode.startsWith(code + ".") || !CODE.matcher(roleCode.substring(code.length() + 1)).matches()) {
                    throw new IllegalStateException("Role code must be <" + code + ">.<code>: " + roleCode);
                }
                if (!codes.add(roleCode)) { throw new IllegalStateException("Duplicate code: " + roleCode); }
                var role = new Role(roleCode, label(roleNode, roleCode));
                roles.add(role);
                roleLabels.put(roleCode, role.label());
            }
            categories.add(new Category(code, label(categoryNode, code), roles));
        }
        return new JobCategories(version.intValue(), categories, roleLabels);
    }

    public int version() { return version; }

    public List<Category> categories() { return categories; }

    public boolean containsRole(String code) { return code != null && roleLabels.containsKey(code); }

    public Optional<String> roleLabel(String code) { return code == null ? Optional.empty() : Optional.ofNullable(roleLabels.get(code)); }

    /** 소분류 전체 수. */
    public int roleCount() { return roleLabels.size(); }

    private static String label(JsonNode node, String owner) {
        var label = text(node, "label", owner);
        if (label.isBlank() || label.length() > MAX_LABEL_LENGTH || label.chars().anyMatch(Character::isISOControl)) {
            throw new IllegalStateException("Label must be 1-" + MAX_LABEL_LENGTH + " characters without control characters: " + owner);
        }
        return label;
    }

    private static String text(JsonNode node, String field, String owner) {
        var value = node.path(field);
        if (!value.isString()) { throw new IllegalStateException("Missing or non-string " + field + ": " + owner); }
        return value.stringValue();
    }
}
