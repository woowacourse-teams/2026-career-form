package com.careerform.formanalysis.generic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormControl;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormElement;
import com.careerform.formanalysis.generic.GenericFieldsRequest.InputType;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Option;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticContext;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticLabel;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticSource;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Visibility;
import com.careerform.formanalysis.generic.GenericFieldsRequest.WriteCommand;
import com.careerform.formanalysis.generic.GenericFieldsResponse.DatePart;
import com.careerform.formanalysis.generic.GenericFieldsResponse.DatePartBinding;
import com.careerform.formanalysis.generic.GenericFieldsResponse.NameBinding;
import com.careerform.formanalysis.generic.JevCategoryFieldResolver.Mapping;

class GenericPersonalNameBirthTest {

    private static final Mapping ABSTAIN = new Mapping(null, 0.0, true, null);
    private static final String BIRTH = "personal.personal.birthDate";

    @ParameterizedTest
    @ValueSource(strings = {"이름 *", "성명", "성함"})
    void combinesASingleKoreanNameField(String label) {
        var response = analyze(List.of(text("name", label), text("phone", "전화번호")),
            Map.of("name", ABSTAIN, "phone", mapped("contact.contact.phoneNumber")));

        assertThat(field(response, "name").binding()).isEqualTo(new NameBinding(DerivedRecipe.KOREAN_FULL_NAME));
    }

    @Test
    void leavesANameFieldNextToASeparateFamilyNameField() {
        var response = analyze(List.of(text("family", "성"), text("name", "이름")),
            Map.of("family", ABSTAIN, "name", ABSTAIN));

        assertThat(field(response, "name").binding()).isNull();
        assertThat(field(response, "name").profileFieldKey()).isNull();
    }

    @Test
    void keepsAModelKeyOnTheNameField() {
        var response = analyze(List.of(text("name", "이름")),
            Map.of("name", mapped("personal.personal.koreanGivenName")));

        assertThat(field(response, "name").profileFieldKey()).isEqualTo("personal.personal.koreanGivenName");
        assertThat(field(response, "name").binding()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"영문 이름", "보호자 이름", "학교 이름"})
    void doesNotCombineOtherNameLabels(String label) {
        var response = analyze(List.of(text("name", label)), Map.of("name", ABSTAIN));

        assertThat(field(response, "name").binding()).isNull();
    }

    @Test
    void assignsBirthDatePartsToSelectsWithPlaceholderOptions() {
        var response = analyze(List.of(year("y", "생년월일 *"), month("m", "생년월일 *"), day("d", "생년월일 *")),
            Map.of("y", ABSTAIN, "m", ABSTAIN, "d", ABSTAIN));

        assertThat(field(response, "y").profileFieldKey()).isEqualTo(BIRTH);
        assertThat(field(response, "y").binding()).isEqualTo(new DatePartBinding(DatePart.YEAR));
        assertThat(field(response, "m").binding()).isEqualTo(new DatePartBinding(DatePart.MONTH));
        assertThat(field(response, "d").binding()).isEqualTo(new DatePartBinding(DatePart.DAY));
    }

    @Test
    void doesNotAssignDatePartsWithoutBirthLabel() {
        var response = analyze(List.of(year("y", "입사일"), month("m", "입사일"), day("d", "입사일")),
            Map.of("y", ABSTAIN, "m", ABSTAIN, "d", ABSTAIN));

        assertThat(field(response, "y").binding()).isNull();
        assertThat(field(response, "m").binding()).isNull();
    }

    @Test
    void doesNotAssignTwoSelectsOfTheSamePart() {
        var response = analyze(List.of(year("y", "생년월일"), year("y2", "생년월일")),
            Map.of("y", ABSTAIN, "y2", ABSTAIN));

        assertThat(field(response, "y").binding()).isNull();
        assertThat(field(response, "y2").binding()).isNull();
    }

    private static GenericFieldsResponse.Field field(GenericFieldsResponse response, String id) {
        return response.fields().stream().filter(field -> field.candidateId().equals(id)).findFirst().orElseThrow();
    }

    private static Mapping mapped(String key) {
        return new Mapping(key, 0.95, true, null);
    }

    private static FieldCandidate text(String id, String label) {
        return new FieldCandidate(id, FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE, label, null, null,
            null, null, null, null, null,
            new SemanticContext(null, InputType.TEXT, null, null, null, null, null, null), null);
    }

    private static FieldCandidate select(String id, String placeholder, String label, List<String> values) {
        List<Option> options = new ArrayList<>();
        options.add(new Option(id + "-0", placeholder));
        for (int i = 0; i < values.size(); i++) {
            options.add(new Option(id + "-" + (i + 1), values.get(i)));
        }
        return new FieldCandidate(id, FormElement.SELECT, FormControl.SELECT, Visibility.VISIBLE, placeholder, null,
            null, null, null, null, null, options,
            new SemanticContext(List.of(new SemanticLabel(SemanticSource.LABEL, label)), null, null, null, null,
                null, null, null), null);
    }

    private static FieldCandidate year(String id, String label) {
        return select(id, "년", label, IntStream.rangeClosed(1950, 2008).mapToObj(String::valueOf).toList());
    }

    private static FieldCandidate month(String id, String label) {
        return select(id, "월", label, IntStream.rangeClosed(1, 12).mapToObj(String::valueOf).toList());
    }

    private static FieldCandidate day(String id, String label) {
        return select(id, "일", label, IntStream.rangeClosed(1, 31).mapToObj(String::valueOf).toList());
    }

    private static GenericFieldsResponse analyze(List<FieldCandidate> fields, Map<String, Mapping> mappings) {
        var request = new GenericFieldsRequest(2, "personal-name-birth",
            new GenericFieldsRequest.Site("example.test", "/apply"),
            List.of(GenericFieldsJevHttp.section("personal", "PERSONAL", fields)),
            List.of(WriteCommand.SET_TEXT, WriteCommand.SELECT_OPTION));
        var resolver = mock(JevCategoryFieldResolver.class);
        when(resolver.resolve(request)).thenReturn(new JevCategoryFieldResolver.Resolution(mappings, 1));
        return new GenericFieldsService(Optional.of(resolver),
            new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered()),
            new FieldInteractionPolicy(), new SupportedProfileFields()).analyze(request);
    }
}
