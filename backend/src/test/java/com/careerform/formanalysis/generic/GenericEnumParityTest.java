package com.careerform.formanalysis.generic;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.api.DisplayName;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;

@DisplayName("범용 열거형과 공유 열거형의 상수 집합")
class GenericEnumParityTest {

    static Stream<Arguments> pairs() {
        return Stream.of(
            Arguments.of(GenericFieldsResponse.AutofillPolicy.class, FieldsAnalysisResponse.AutofillPolicy.class),
            Arguments.of(GenericFieldsResponse.InteractionStatus.class,
                FieldsAnalysisResponse.InteractionStatus.class),
            Arguments.of(GenericFieldsRequest.WriteCommand.class, FieldsAnalysisResponse.WriteCommand.class),
            Arguments.of(GenericFieldsRequest.FormElement.class, FieldsAnalysisRequest.FormElement.class),
            Arguments.of(GenericFieldsRequest.FormControl.class, FieldsAnalysisRequest.FormControl.class),
            Arguments.of(GenericFieldsRequest.Visibility.class, FieldsAnalysisRequest.Visibility.class),
            Arguments.of(GenericFieldsRequest.InputType.class, FieldsAnalysisRequest.InputType.class),
            Arguments.of(GenericFieldsRequest.InputMode.class, FieldsAnalysisRequest.InputMode.class),
            Arguments.of(GenericFieldsRequest.Autocomplete.class, FieldsAnalysisRequest.Autocomplete.class),
            Arguments.of(GenericFieldsRequest.SemanticSource.class, FieldsAnalysisRequest.SemanticSource.class)
        );
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("pairs")
    @DisplayName("한쪽에만 상수가 생기면 실패한다")
    void constantNamesAreIdentical(Class<? extends Enum<?>> generic, Class<? extends Enum<?>> shared) {
        assertThat(names(generic)).isNotEmpty().isEqualTo(names(shared));
    }

    private static Set<String> names(Class<? extends Enum<?>> type) {
        return Arrays.stream(type.getEnumConstants()).map(Enum::name).collect(Collectors.toSet());
    }
}
