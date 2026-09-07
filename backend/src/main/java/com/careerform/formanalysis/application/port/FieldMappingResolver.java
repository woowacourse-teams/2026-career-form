package com.careerform.formanalysis.application.port;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;

public interface FieldMappingResolver {

    @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
    @JsonSubTypes({
        @JsonSubTypes.Type(value = DirectBinding.class, name = "DIRECT"),
        @JsonSubTypes.Type(value = DerivedBinding.class, name = "DERIVED"),
        @JsonSubTypes.Type(value = LookupBinding.class, name = "LOOKUP"),
        @JsonSubTypes.Type(value = ButtonOptionBinding.class, name = "BUTTON_OPTION")
    })
    sealed interface ValueBinding permits DirectBinding, DerivedBinding, LookupBinding, ButtonOptionBinding {
    }

    record DirectBinding(String profileFieldKey) implements ValueBinding {
        public DirectBinding {
            if (profileFieldKey == null || profileFieldKey.isBlank()) {
                throw new IllegalArgumentException("프로필 필드 키가 비어 있습니다");
            }
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record DerivedBinding(
        DerivedRecipe recipe,
        @JsonSetter(nulls = Nulls.SET) String profileFieldKey,
        @JsonSetter(nulls = Nulls.SET) String trueLabel,
        @JsonSetter(nulls = Nulls.SET) String falseLabel
    ) implements ValueBinding {
        public DerivedBinding(DerivedRecipe recipe) {
            this(recipe, null, null, null);
        }

        public DerivedBinding(DerivedRecipe recipe, String profileFieldKey) {
            this(recipe, profileFieldKey, null, null);
        }

        public DerivedBinding {
            if (recipe == null) {
                throw new IllegalArgumentException("조합 recipe가 없습니다");
            }
            if (profileFieldKey != null && profileFieldKey.isBlank()) {
                throw new IllegalArgumentException("프로필 필드 키가 비어 있습니다");
            }
            if ((trueLabel == null) != (falseLabel == null)
                || (trueLabel != null && (trueLabel.isBlank() || falseLabel.isBlank()))) {
                throw new IllegalArgumentException("boolean 변환 라벨이 올바르지 않습니다");
            }
        }
    }

    record LookupBinding(
        String profileFieldKey,
        Map<String, String> optionMap
    ) implements ValueBinding {
        public LookupBinding {
            if (profileFieldKey == null || profileFieldKey.isBlank()
                || optionMap == null || optionMap.isEmpty()
                || optionMap.entrySet().stream().anyMatch(entry -> entry.getKey() == null
                    || entry.getKey().isBlank() || entry.getValue() == null
                    || entry.getValue().isBlank())) {
                throw new IllegalArgumentException("option lookup 계약이 올바르지 않습니다");
            }
            optionMap = Map.copyOf(optionMap);
        }
    }

    /** A labelled custom-menu option whose submitted code is verified by the site policy. */
    record ButtonOptionBinding(
        String profileFieldKey,
        Map<String, String> optionMap,
        Map<String, String> optionCodeMap
    ) implements ValueBinding {
        public ButtonOptionBinding {
            if (profileFieldKey == null || profileFieldKey.isBlank()
                || optionMap == null || optionMap.isEmpty()
                || optionCodeMap == null || optionCodeMap.isEmpty()) {
                throw new IllegalArgumentException("button option 계약이 올바르지 않습니다");
            }
            Map<String, String> mappings = Map.copyOf(optionMap);
            Map<String, String> codes = Map.copyOf(optionCodeMap);
            if (mappings.entrySet().stream().anyMatch(entry -> entry.getKey() == null
                    || entry.getKey().isBlank() || entry.getValue() == null || entry.getValue().isBlank())
                || mappings.values().stream().anyMatch(value -> !codes.containsKey(value))
                || codes.entrySet().stream().anyMatch(entry -> entry.getKey() == null
                    || entry.getKey().isBlank() || entry.getValue() == null || entry.getValue().isBlank())) {
                throw new IllegalArgumentException("button option 계약이 올바르지 않습니다");
            }
            optionMap = mappings;
            optionCodeMap = codes;
        }
    }

    enum DerivedRecipe {
        KOREAN_FULL_NAME,
        ENGLISH_FULL_NAME_GIVEN_FIRST,
        ENGLISH_FULL_NAME_FAMILY_FIRST,
        BOOLEAN_YN,
        YEAR_MONTH
    }

    Resolution resolve(FieldsAnalysisRequest request);

    record Resolution(
        int schemaVersion,
        String snapshotId,
        List<Result> results
    ) {
    }

    sealed interface Result permits Match, NoMatch {
        String candidateId();
    }

    record Match(
        String candidateId,
        ValueBinding valueBinding,
        boolean allowsReadonlyWrite
    ) implements Result {

        public Match(String candidateId, String profileFieldKey) {
            this(candidateId, new DirectBinding(profileFieldKey), false);
        }

        public Match(String candidateId, String profileFieldKey, boolean allowsReadonlyWrite) {
            this(candidateId, new DirectBinding(profileFieldKey), allowsReadonlyWrite);
        }

        public Match(String candidateId, ValueBinding valueBinding) {
            this(candidateId, valueBinding, false);
        }
    }

    record NoMatch(String candidateId) implements Result {
    }
}
