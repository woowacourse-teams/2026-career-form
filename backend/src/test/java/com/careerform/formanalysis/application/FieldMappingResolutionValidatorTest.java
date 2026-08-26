package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import com.careerform.formanalysis.domain.FieldMappingResolution;
import com.careerform.formanalysis.domain.FieldsSnapshot;
import com.careerform.formanalysis.domain.FormControl;
import com.careerform.formanalysis.domain.FormElement;
import com.careerform.formanalysis.domain.Site;
import com.careerform.formanalysis.domain.Visibility;

class FieldMappingResolutionValidatorTest {

    private final FieldMappingResolutionValidator validator =
        new FieldMappingResolutionValidator();

    @Test
    void acceptsCanonicalMatchAndNoMatchForEveryCandidate() {
        FieldMappingResolution resolution = new FieldMappingResolution(
            2,
            "snapshot-1",
            List.of(
                new FieldMappingResolution.Match(
                    "field-1",
                    "contact.contact.email"
                ),
                new FieldMappingResolution.NoMatch("field-2")
            )
        );

        assertThatCode(() -> validator.validate(snapshot(), resolution))
            .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @MethodSource("invalidResolutions")
    void rejectsInvalidHeaderCandidateSetOrProfileKey(
        FieldMappingResolution resolution
    ) {
        assertThatThrownBy(() -> validator.validate(snapshot(), resolution))
            .isInstanceOf(InvalidResolverOutputException.class)
            .hasMessage("Resolver 출력 계약을 확인할 수 없습니다");
    }

    private static Stream<FieldMappingResolution> invalidResolutions() {
        return Stream.of(
            new FieldMappingResolution(1, "snapshot-1", validResults()),
            new FieldMappingResolution(2, "another-snapshot", validResults()),
            new FieldMappingResolution(2, "snapshot-1", List.of(
                new FieldMappingResolution.NoMatch("field-1")
            )),
            new FieldMappingResolution(2, "snapshot-1", List.of(
                new FieldMappingResolution.NoMatch("field-1"),
                new FieldMappingResolution.NoMatch("field-1")
            )),
            new FieldMappingResolution(2, "snapshot-1", List.of(
                new FieldMappingResolution.NoMatch("field-1"),
                new FieldMappingResolution.NoMatch("unknown-field")
            )),
            new FieldMappingResolution(2, "snapshot-1", List.of(
                new FieldMappingResolution.Match("field-1", "contact.email"),
                new FieldMappingResolution.NoMatch("field-2")
            )),
            new FieldMappingResolution(2, "snapshot-1", List.of(
                new FieldMappingResolution.Match(
                    "field-1",
                    "languages.languageTest.evidenceDocumentPath"
                ),
                new FieldMappingResolution.NoMatch("field-2")
            ))
        );
    }

    private static List<FieldMappingResolution.Result> validResults() {
        return List.of(
            new FieldMappingResolution.NoMatch("field-1"),
            new FieldMappingResolution.NoMatch("field-2")
        );
    }

    private static FieldsSnapshot snapshot() {
        return new FieldsSnapshot(
            2,
            "snapshot-1",
            new Site("example.test", "/application/*"),
            List.of(new FieldsSnapshot.Section(
                "section-1",
                null,
                "기본 정보",
                List.of(field("field-1"), field("field-2")),
                List.of()
            ))
        );
    }

    private static FieldsSnapshot.FieldCandidate field(String candidateId) {
        return new FieldsSnapshot.FieldCandidate(
            candidateId,
            FormElement.INPUT,
            FormControl.TEXT,
            Visibility.VISIBLE,
            "합성 필드",
            null,
            null,
            null,
            null,
            null,
            null,
            null
        );
    }
}
