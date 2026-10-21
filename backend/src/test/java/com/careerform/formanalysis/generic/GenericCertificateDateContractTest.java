package com.careerform.formanalysis.generic;

import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.CATEGORIES;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.FIELDS;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answerAll;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormControl;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormElement;
import com.careerform.formanalysis.generic.GenericFieldsRequest.InputType;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Item;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Section;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticContext;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Visibility;
import com.careerform.formanalysis.generic.GenericFieldsRequest.WriteCommand;
import com.careerform.formanalysis.generic.GenericFieldsResponse.AutofillPolicy;
import com.careerform.formanalysis.generic.GenericFieldsResponse.Field;
import com.careerform.formanalysis.generic.GenericFieldsResponse.InteractionStatus;
import com.careerform.formanalysis.generic.GenericFieldsResponse.WritePlan;

@DisplayName("취득 자격증의 범용 날짜 결정 계약")
class GenericCertificateDateContractTest {

    private static final String DATE = "certifications.certificate.acquisitionDate";

    @ParameterizedTest
    @ValueSource(strings = {"ABSTAIN", DATE})
    @DisplayName("provider의 null과 낮은 confidence 매핑 모두 세 행의 같은 취득일 READY 계약이 된다")
    void resolvesAllRowsRegardlessOfProviderChoice(String choice) {
        for (String label : List.of("취득일/응시일", "취득/응시일", "취득일")) {
            var response = analyze("CERTIFICATE", label, FormControl.TEXT, choice, true);
            assertThat(response.fields()).containsExactlyElementsOf(IntStream.range(0, 3)
                .mapToObj(index -> new Field("date-" + index, DATE, 1.0, true, null,
                    AutofillPolicy.ALLOWED, InteractionStatus.READY, new WritePlan(WriteCommand.SELECT_DATE)))
                .toList());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"LANGUAGE", "MIXED", "ABSTAIN", "NONE"})
    @DisplayName("자격증으로 확정되지 않은 섹션에는 결정적 자격 취득일 규칙을 적용하지 않는다")
    void doesNotInventCertificateDatesInOtherSections(String category) {
        assertThat(analyze(category, "취득일/응시일", FormControl.TEXT, "ABSTAIN", true).fields())
            .allSatisfy(field -> assertThat(field.profileFieldKey()).isNull());
    }

    @ParameterizedTest
    @ValueSource(strings = {"응시일", "등록번호", "발급기관"})
    @DisplayName("취득일 의미가 없는 대상은 추정하지 않는다")
    void requiresAcquisitionDateWording(String label) {
        assertThat(analyze("CERTIFICATE", label, FormControl.TEXT, "ABSTAIN", true).fields())
            .allSatisfy(field -> assertThat(field.profileFieldKey()).isNull());
    }

    @ParameterizedTest
    @ValueSource(strings = {"SELECT", "TEXTAREA"})
    @DisplayName("날짜 입력 컨트롤이 아닌 대상에는 적용하지 않는다")
    void requiresDateControl(String control) {
        assertThat(analyze("CERTIFICATE", "취득일/응시일", FormControl.valueOf(control), "ABSTAIN", true).fields())
            .allSatisfy(field -> assertThat(field.profileFieldKey()).isNull());
    }

    @ParameterizedTest
    @ValueSource(strings = {"ABSTAIN", DATE})
    @DisplayName("SELECT_DATE 미지원이면 기존 공유 정책의 SEARCH_SELECTION 계약을 그대로 보존한다")
    void keepsSharedWriteCapabilityPolicy(String choice) {
        assertThat(analyze("CERTIFICATE", "취득일/응시일", FormControl.TEXT, choice, false).fields())
            .allSatisfy(field -> {
                assertThat(field.profileFieldKey()).isEqualTo(DATE);
                assertThat(field.interactionStatus()).isEqualTo(InteractionStatus.READY);
                assertThat(field.writePlan()).isEqualTo(new WritePlan(WriteCommand.SEARCH_SELECTION));
            });
    }

    private GenericFieldsResponse analyze(String category, String label, FormControl control,
        String choice, boolean supportsDate) {
        var http = new GenericFieldsJevHttp();
        http.respond(call -> answerAll(call, choice, "ABSTAIN".equals(choice) ? 0.46 : 0.48));
        var resolver = new JevCategoryFieldResolver(GenericFieldsJevHttp.client(http), FIELDS, CATEGORIES,
            3, 5, 10, 8000);
        var service = new GenericFieldsService(Optional.of(resolver),
            new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered()),
            new FieldInteractionPolicy(), FIELDS);
        var items = IntStream.range(0, 3).mapToObj(index -> new Item("row-" + index,
            List.of(new FieldCandidate("date-" + index,
                control == FormControl.TEXT ? FormElement.INPUT
                    : control == FormControl.SELECT ? FormElement.SELECT : FormElement.TEXTAREA,
                control, Visibility.VISIBLE, label, null, null, label, null, true, null, null,
                new SemanticContext(null, InputType.TEXT, null, null, null, null, 10, null)))))
            .toList();
        return service.analyze(new GenericFieldsRequest(2, "synthetic-certificates",
            new GenericFieldsRequest.Site("example.test", "/apply"),
            List.of(new Section("certificates", null, "Certificates", List.of(), items, category)),
            supportsDate ? List.of(WriteCommand.SELECT_DATE) : List.of()));
    }
}
