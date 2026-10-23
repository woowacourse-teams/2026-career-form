package com.careerform.formanalysis.generic;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.SupportedProfileFields;

/** 범용 섹션 범주를 지원 프로필 키 접두사에서 생성한다. */
@Component
public final class SectionCategories {

    public static final String NONE = "NONE";
    public static final String MIXED = "MIXED";
    public static final String ABSTAIN = "ABSTAIN";

    /** 프로필 키 접두사 중 다른 범주로 묶는 것만 둔다. 나머지 접두사는 이름에서 범주를 만든다. */
    private static final Map<String, String> GROUPED_PREFIXES = Map.of(
        "contact", "PERSONAL",
        "military", "SENSITIVE",
        "veteran", "SENSITIVE",
        "disability", "SENSITIVE",
        "health", NONE
    );

    private final Map<String, List<String>> keysByCategory;

    public SectionCategories(SupportedProfileFields fields) {
        Map<String, List<String>> grouped = new LinkedHashMap<>();
        for (String key : fields.keys()) {
            grouped.computeIfAbsent(categoryOf(key), category -> new ArrayList<>()).add(key);
        }
        grouped.putIfAbsent(NONE, List.of());
        grouped.put(MIXED, List.of());
        grouped.put(ABSTAIN, List.of());
        Map<String, List<String>> copy = new LinkedHashMap<>();
        grouped.forEach((category, keys) -> copy.put(category, List.copyOf(keys)));
        this.keysByCategory = Collections.unmodifiableMap(copy);
    }

    /** 복수형 접두사(languages, careers 등)는 두 번째 마디의 첫 단어를 범주 이름으로 쓴다. */
    public static String categoryOf(String key) {
        String[] parts = key.split("\\.");
        String grouped = GROUPED_PREFIXES.get(parts[0]);
        if (grouped != null) {
            return grouped;
        }
        String word = parts[0].endsWith("s") && parts.length > 1
            ? parts[1].split("(?=[A-Z])")[0]
            : parts[0];
        return word.toUpperCase(Locale.ROOT);
    }

    public List<String> names() {
        return List.copyOf(keysByCategory.keySet());
    }

    public boolean contains(String category) {
        return category != null && keysByCategory.containsKey(category);
    }

    public List<String> keysOf(String category) {
        return keysByCategory.getOrDefault(category, List.of());
    }
}
