package com.careerform.formanalysis.generic;

import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.CATEGORIES;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.FIELDS;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answerAll;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.field;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.request;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.section;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.RecordComponent;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.policy.CompanyFormPolicyFixture;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.generic.GenericFieldsRequest.WriteCommand;
import com.careerform.formanalysis.generic.GenericFieldsResponse.AutofillPolicy;
import com.careerform.formanalysis.generic.GenericFieldsResponse.Field;
import com.careerform.formanalysis.generic.GenericFieldsResponse.InteractionStatus;
import com.careerform.formanalysis.generic.GenericFieldsResponse.Reason;
import com.careerform.formanalysis.generic.GenericFieldsResponse.Status;
import com.careerform.formanalysis.generic.GenericFieldsResponse.WritePlan;

@DisplayName("범용 섹션별 칸 매칭 서비스")
class GenericFieldsServiceTest {

    private static final String SCHOOL = "education.university.schoolName";

    private final GenericFieldsJevHttp http = new GenericFieldsJevHttp();

    @Test
    @DisplayName("정적 정책 사이트와 정책 조회 불가 요청은 JEV를 호출하지 않고 빈 칸 목록으로 단락한다")
    void shortCircuitsWithoutCallingJev() {
        var staticPolicy = service((host, path) -> new CompanyFormPolicyProvider.Available(CompanyFormPolicyFixture.sk()))
            .analyze(sample());
        var unavailable = service((host, path) -> new CompanyFormPolicyProvider.Unavailable()).analyze(sample());

        assertThat(http.calls()).isEmpty();
        assertThat(staticPolicy.status()).isEqualTo(Status.STATIC_POLICY_PRESENT);
        assertThat(unavailable.status()).isEqualTo(Status.POLICY_UNAVAILABLE);
        for (var response : List.of(staticPolicy, unavailable)) {
            assertThat(response.schemaVersion()).isEqualTo(2);
            assertThat(response.snapshotId()).isEqualTo("synthetic-snapshot");
            assertThat(response.fields()).isEmpty();
            assertThat(response.diagnostics().jevCalls()).isZero();
        }
    }

    @Test
    @DisplayName("범용 사이트는 요청 순서대로 칸별 매핑과 JEV 호출 수 진단을 COMPLETE로 돌려준다")
    void returnsFieldsInRequestOrderWithDiagnostics() {
        http.respond(call -> answerAll(call, SCHOOL, 0.66));

        var response = service(notRegistered()).analyze(sample());

        assertThat(response.status()).isEqualTo(Status.COMPLETE);
        assertThat(response.schemaVersion()).isEqualTo(2);
        assertThat(response.fields()).containsExactly(
            new Field("edu-1", SCHOOL, 0.66, true, null, AutofillPolicy.CONDITIONAL, InteractionStatus.READY,
                new WritePlan(WriteCommand.SET_TEXT)),
            new Field("mixed-1", SCHOOL, 0.66, false, null, AutofillPolicy.CONDITIONAL, InteractionStatus.READY,
                new WritePlan(WriteCommand.SET_TEXT)));
        assertThat(response.diagnostics().jevCalls()).isEqualTo(2);
        assertThat(response.diagnostics().elapsedMs()).isNotNegative();
    }

    @Test
    @DisplayName("JEV resolver가 없으면 모든 칸을 null 매핑, LLM_UNAVAILABLE, BLOCKED로 응답한다")
    void missingResolverIsUnavailable() {
        var response = new GenericFieldsService(Optional.empty(), new FormAnalysisRouter(notRegistered()),
            new FieldInteractionPolicy(), new SupportedProfileFields())
            .analyze(sample());

        assertThat(response.status()).isEqualTo(Status.COMPLETE);
        assertThat(response.schemaVersion()).isEqualTo(2);
        assertThat(response.fields()).containsExactly(
            new Field("edu-1", null, 0.0, false, Reason.LLM_UNAVAILABLE, null, InteractionStatus.BLOCKED, null),
            new Field("mixed-1", null, 0.0, false, Reason.LLM_UNAVAILABLE, null, InteractionStatus.BLOCKED, null));
        assertThat(response.diagnostics().jevCalls()).isZero();
    }

    @Test
    @DisplayName("섹션 id·칸 id 중복과 없는 부모 참조는 JEV 호출 없이 거부한다")
    void rejectsInvalidStructure() {
        var service = service(notRegistered());
        var duplicateSection = request("example.test", List.of(
            section("same", "EDUCATION", List.of(field("a", "학교명"))),
            section("same", "EDUCATION", List.of(field("b", "학교명")))));
        var duplicateField = request("example.test", List.of(
            section("one", "EDUCATION", List.of(field("a", "학교명"))),
            section("two", "EDUCATION", List.of(field("a", "학교명")))));
        var orphan = request("example.test", List.of(new GenericFieldsRequest.Section("child", "missing", null,
            List.of(field("a", "학교명")), null, "EDUCATION")));

        for (var invalid : List.of(duplicateSection, duplicateField, orphan)) {
            assertThatThrownBy(() -> service.analyze(invalid)).isInstanceOf(ResponseStatusException.class);
        }
        assertThat(http.calls()).isEmpty();
    }

    @Test
    @DisplayName("요청 DTO에는 값 필드가 없고 응답 칸은 매핑과 세 입력 판정만, 진단은 개수와 시간만 담는다")
    void contractsCarryNoValues() {
        Set<String> request = new HashSet<>();
        for (Class<?> type : GenericFieldsRequest.class.getDeclaredClasses()) {
            if (type.isRecord()) {
                request.addAll(components(type));
            }
        }
        request.addAll(components(GenericFieldsRequest.class));

        assertThat(request).contains("category").noneMatch(name -> name.toLowerCase().contains("value")
            || name.toLowerCase().contains("profile") || name.toLowerCase().contains("itemcount"));
        assertThat(components(GenericFieldsResponse.Field.class))
            .containsExactly("candidateId", "profileFieldKey", "confidence", "categoryConfirmed", "reason",
                "autofillPolicy", "interactionStatus", "writePlan");
        assertThat(components(GenericFieldsResponse.WritePlan.class)).containsExactly("command");
        assertThat(components(GenericFieldsResponse.Diagnostics.class)).containsExactly("jevCalls", "elapsedMs");
    }

    private GenericFieldsService service(CompanyFormPolicyProvider policies) {
        var resolver = new JevCategoryFieldResolver(GenericFieldsJevHttp.client(http), FIELDS, CATEGORIES, 3, 5, 10,
            8000);
        return new GenericFieldsService(Optional.of(resolver), new FormAnalysisRouter(policies),
            new FieldInteractionPolicy(), new SupportedProfileFields());
    }

    private static CompanyFormPolicyProvider notRegistered() {
        return (host, path) -> new CompanyFormPolicyProvider.NotRegistered();
    }

    private static GenericFieldsRequest sample() {
        return request("example.test", List.of(
            section("edu", "EDUCATION", List.of(field("edu-1", "학교명"))),
            section("mixed", "MIXED", List.of(field("mixed-1", "학교명")))));
    }

    private static List<String> components(Class<?> type) {
        return Arrays.stream(type.getRecordComponents()).map(RecordComponent::getName).toList();
    }
}
