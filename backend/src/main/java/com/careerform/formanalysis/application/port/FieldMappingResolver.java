package com.careerform.formanalysis.application.port;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;

public interface FieldMappingResolver {

    @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
    @JsonSubTypes({
        @JsonSubTypes.Type(value = DirectBinding.class, name = "DIRECT"),
        @JsonSubTypes.Type(value = DerivedBinding.class, name = "DERIVED")
    })
    sealed interface ValueBinding permits DirectBinding, DerivedBinding {
    }

    record DirectBinding(String profileFieldKey) implements ValueBinding {
        public DirectBinding {
            if (profileFieldKey == null || profileFieldKey.isBlank()) {
                throw new IllegalArgumentException("프로필 필드 키가 비어 있습니다");
            }
        }
    }

    record DerivedBinding(DerivedRecipe recipe) implements ValueBinding {
        public DerivedBinding {
            if (recipe == null) {
                throw new IllegalArgumentException("조합 recipe가 없습니다");
            }
        }
    }

    enum DerivedRecipe {
        KOREAN_FULL_NAME,
        ENGLISH_FULL_NAME_GIVEN_FIRST,
        ENGLISH_FULL_NAME_FAMILY_FIRST,
        EDUCATION_TYPE_AND_DEGREE
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
