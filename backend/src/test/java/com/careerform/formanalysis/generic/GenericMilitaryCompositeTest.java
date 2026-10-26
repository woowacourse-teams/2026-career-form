package com.careerform.formanalysis.generic;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormControl;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormElement;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Option;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Visibility;

class GenericMilitaryCompositeTest {

    private static final List<String> COMPOSITE = List.of("병역구분", "병역필_현역(병)", "병역필_현역(장교)",
        "병역필_사회복무요원", "병역면제", "미필", "해당없음");

    @Test
    void compositeStatusOptionsMapToMilitaryStatus() {
        assertThat(GenericProfileSemantics.militaryKey("SENSITIVE", "병역", select("병역구분", COMPOSITE)))
            .isEqualTo("military.military.militaryStatus");
        assertThat(GenericProfileSemantics.militaryKey(null, "병역 사항", select(null, COMPOSITE)))
            .isEqualTo("military.military.militaryStatus");
    }

    @ParameterizedTest
    @MethodSource("abstaining")
    void incompleteOrUnrelatedOptionSetsAbstain(String category, String heading, List<String> options) {
        assertThat(GenericProfileSemantics.militaryKey(category, heading, select("구분", options))).isNull();
    }

    static Stream<Arguments> abstaining() {
        return Stream.of(
            Arguments.of("SENSITIVE", "병역", List.of("현역", "보충역", "사회복무요원")),
            Arguments.of("SENSITIVE", "병역", List.of("만기전역", "의병전역", "소집해제")),
            Arguments.of("SENSITIVE", "병역", List.of("병역필", "미필")),
            Arguments.of("PERSONAL", "기본 정보", COMPOSITE),
            Arguments.of("SENSITIVE", "보훈", List.of("대상", "비대상"))
        );
    }

    @Test
    void textControlsAbstain() {
        var text = new FieldCandidate("m", FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE, "병역구분",
            null, null, null, null, null, null, options(COMPOSITE));
        assertThat(GenericProfileSemantics.militaryKey("SENSITIVE", "병역", text)).isNull();
    }

    private static FieldCandidate select(String label, List<String> choices) {
        return new FieldCandidate("m", FormElement.SELECT, FormControl.SELECT, Visibility.VISIBLE, label,
            null, null, null, null, null, null, options(choices));
    }

    private static List<Option> options(List<String> choices) {
        return IntStream.range(0, choices.size())
            .mapToObj(index -> new Option("o" + index, choices.get(index))).toList();
    }
}
