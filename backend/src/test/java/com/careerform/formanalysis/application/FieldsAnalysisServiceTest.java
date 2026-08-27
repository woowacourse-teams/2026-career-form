package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Item;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Option;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.AnalysisStatus;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.AutofillPolicy;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.InteractionStatus;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MappingStatus;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchType;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchedFieldAnalysis;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.Mode;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.NoMatchFieldAnalysis;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.ReasonCode;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WarningCode;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WritePlan;
import com.careerform.formanalysis.exception.InvalidSnapshotException;
import com.careerform.formanalysis.exception.ResolverException;

import tools.jackson.databind.ObjectMapper;

@DisplayName("필드 분석 서비스")
class FieldsAnalysisServiceTest {

    @Test
    @DisplayName("Resolver가 없으면 후보가 없어도 PARTIAL 응답을 반환한다")
    void reportsUnavailableWhenResolverIsAbsentEvenWithoutCandidates() {
        FieldsAnalysisResponse response = service(Optional.empty()).analyze(emptyRequest());

        assertUnavailable(response);
    }

    @Test
    @DisplayName("후보가 없으면 사용 가능한 Resolver를 호출하지 않는다")
    void doesNotCallAvailableResolverWhenThereAreNoCandidates() {
        AtomicInteger calls = new AtomicInteger();
        FieldMappingResolver resolver = resolver(request -> {
            calls.incrementAndGet();
            throw new AssertionError("후보가 없으면 Resolver를 호출하면 안 됩니다");
        });

        FieldsAnalysisResponse response = service(Optional.of(resolver))
            .analyze(emptyRequest());

        assertThat(calls).hasValue(0);
        assertThat(response.analysisStatus()).isEqualTo(AnalysisStatus.COMPLETE);
        assertThat(response.fields()).isEmpty();
        assertThat(response.warningCodes()).isNull();
    }

    @Test
    @DisplayName("Resolver 순서와 무관하게 모든 필드를 요청 순서로 반환한다")
    void mapsEveryFieldInRequestTraversalOrder() {
        FieldMappingResolver resolver = resolver(
            ignored -> new FieldMappingResolver.Resolution(
                2,
                "snapshot-1",
                List.of(
                    new FieldMappingResolver.NoMatch("field-item"),
                    new FieldMappingResolver.Match(
                        "field-direct",
                        "contact.contact.email"
                    )
                )
            )
        );

        FieldsAnalysisResponse response = service(Optional.of(resolver)).analyze(request());

        assertThat(response.analysisStatus()).isEqualTo(AnalysisStatus.COMPLETE);
        assertThat(response.fields()).containsExactly(
            new MatchedFieldAnalysis(
                "field-direct",
                MatchType.MATCH,
                "contact.contact.email",
                AutofillPolicy.ALLOWED,
                MappingStatus.LLM_SUGGESTED,
                InteractionStatus.READY,
                new WritePlan(WriteCommand.SET_TEXT)
            ),
            new NoMatchFieldAnalysis(
                "field-item",
                MatchType.NO_MATCH,
                MappingStatus.LLM_SUGGESTED,
                InteractionStatus.BLOCKED,
                List.of(ReasonCode.NO_MATCH)
            )
        );
    }

    @Test
    @DisplayName("모든 판단이 NO_MATCH여도 필드별 COMPLETE 결과를 반환한다")
    void treatsAllNoMatchAsCompleteExplicitFieldResults() {
        FieldMappingResolver resolver = resolver(ignored -> validNoMatchResolution());

        FieldsAnalysisResponse response = service(Optional.of(resolver)).analyze(request());

        assertThat(response.analysisStatus()).isEqualTo(AnalysisStatus.COMPLETE);
        assertThat(response.fields()).hasSize(2)
            .allMatch(NoMatchFieldAnalysis.class::isInstance);
        assertThat(response.warningCodes()).isNull();
    }

    @Test
    @DisplayName("Resolver 장애가 발생하면 결과 전체를 버리고 PARTIAL로 반환한다")
    void discardsAllResultsWhenResolverIsUnavailable() {
        FieldMappingResolver resolver = resolver(ignored -> {
            throw new ResolverException("private-provider-marker");
        });

        FieldsAnalysisResponse response = service(Optional.of(resolver)).analyze(request());

        assertUnavailable(response);
    }

    @ParameterizedTest
    @MethodSource("invalidResolverOutputs")
    @DisplayName("Resolver 출력 계약이 어긋나면 결과 전체를 폐기한다")
    void discardsEveryResultWhenResolverOutputViolatesTheContract(
        FieldMappingResolver.Resolution invalidOutput
    ) {
        FieldMappingResolver resolver = resolver(ignored -> invalidOutput);

        FieldsAnalysisResponse response = service(Optional.of(resolver)).analyze(request());

        assertUnavailable(response);
    }

    @Test
    @DisplayName("애플리케이션 버그는 LLM 장애로 숨기지 않는다")
    void doesNotConvertUnexpectedApplicationBugToLlmUnavailable() {
        FieldMappingResolver resolver = resolver(ignored -> {
            throw new IllegalStateException("synthetic-local-bug");
        });

        assertThatThrownBy(() -> service(Optional.of(resolver)).analyze(request()))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("synthetic-local-bug");
    }

    @Test
    @DisplayName("fields 성공 응답을 외부 JSON 계약 그대로 직렬화한다")
    void serializesFieldsWithOnlyTheExternalContractProperties() {
        FieldsAnalysisResponse response = FieldsAnalysisResponse.complete(
            "snapshot-1",
            List.of(
                new MatchedFieldAnalysis(
                    "field-1",
                    MatchType.MATCH,
                    "contact.contact.email",
                    AutofillPolicy.ALLOWED,
                    MappingStatus.LLM_SUGGESTED,
                    InteractionStatus.READY,
                    new WritePlan(WriteCommand.SET_TEXT)
                ),
                new NoMatchFieldAnalysis(
                    "field-2",
                    MatchType.NO_MATCH,
                    MappingStatus.LLM_SUGGESTED,
                    InteractionStatus.BLOCKED,
                    List.of(ReasonCode.NO_MATCH)
                )
            )
        );

        assertThat(new ObjectMapper().writeValueAsString(response)).isEqualTo(
            "{\"snapshotId\":\"snapshot-1\",\"mode\":\"GENERIC\","
                + "\"analysisStatus\":\"COMPLETE\",\"fields\":[{"
                + "\"candidateId\":\"field-1\",\"matchType\":\"MATCH\","
                + "\"profileFieldKey\":\"contact.contact.email\","
                + "\"autofillPolicy\":\"ALLOWED\","
                + "\"mappingStatus\":\"LLM_SUGGESTED\","
                + "\"interactionStatus\":\"READY\","
                + "\"writePlan\":{\"command\":\"SET_TEXT\"}},{"
                + "\"candidateId\":\"field-2\",\"matchType\":\"NO_MATCH\","
                + "\"mappingStatus\":\"LLM_SUGGESTED\","
                + "\"interactionStatus\":\"BLOCKED\","
                + "\"reasonCodes\":[\"NO_MATCH\"]}]}"
        );
    }

    @Test
    @DisplayName("필드 응답의 예약 enum wire 값을 유지한다")
    void retainsReservedResponseEnumValues() {
        assertThat(Mode.values()).containsExactly(Mode.ADAPTER, Mode.GENERIC);
        assertThat(WarningCode.values()).containsExactly(
            WarningCode.UNRESOLVED_FIELD,
            WarningCode.LLM_UNAVAILABLE
        );
    }

    @Test
    @DisplayName("필드 snapshot의 candidate ID 중복을 거부한다")
    void rejectsDuplicateCandidateIds() {
        FieldsAnalysisRequest duplicate = new FieldsAnalysisRequest(
            2,
            "snapshot-1",
            site(),
            List.of(new Section(
                "section-fields",
                null,
                null,
                List.of(field("same-field")),
                List.of(new Item("item-1", List.of(field("same-field"))))
            ))
        );

        assertThatThrownBy(() -> service(Optional.empty()).analyze(duplicate))
            .isInstanceOf(InvalidSnapshotException.class);
    }

    @Test
    @DisplayName("필드 snapshot의 section ID 중복은 프론트가 정제한 순서를 신뢰한다")
    void acceptsDuplicateSectionIds() {
        FieldsAnalysisRequest duplicateSections = new FieldsAnalysisRequest(
            2,
            "snapshot-1",
            site(),
            List.of(
                section("same-section", null),
                section("same-section", null)
            )
        );

        FieldsAnalysisResponse response = service(Optional.of(
            resolver(ignored -> new FieldMappingResolver.Resolution(
                2,
                "snapshot-1",
                List.of()
            ))
        )).analyze(duplicateSections);

        assertThat(response.analysisStatus()).isEqualTo(AnalysisStatus.COMPLETE);
    }

    @Test
    @DisplayName("parent 관계와 item·option ID 중복은 프론트가 정제한 snapshot을 신뢰한다")
    void acceptsParentRelationshipsAndDuplicateItemAndOptionIds() {
        FieldCandidate field = new FieldCandidate(
            "field-1",
            FormElement.SELECT,
            FormControl.SELECT,
            Visibility.VISIBLE,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            List.of(
                new Option("same-option", "첫 번째"),
                new Option("same-option", "두 번째")
            )
        );
        FieldsAnalysisRequest relaxed = new FieldsAnalysisRequest(
            2,
            "snapshot-1",
            site(),
            List.of(
                new Section(
                    "missing-parent",
                    "unknown-section",
                    null,
                    List.of(field),
                    List.of(
                        new Item("same-item", List.of(field("field-2"))),
                        new Item("same-item", List.of(field("field-3")))
                    )
                ),
                section("self-parent", "self-parent"),
                section("cycle-a", "cycle-b"),
                section("cycle-b", "cycle-a")
            )
        );
        FieldMappingResolver resolver = resolver(
            ignored -> new FieldMappingResolver.Resolution(
                2,
                "snapshot-1",
                List.of(
                    new FieldMappingResolver.NoMatch("field-1"),
                    new FieldMappingResolver.NoMatch("field-2"),
                    new FieldMappingResolver.NoMatch("field-3")
                )
            )
        );

        FieldsAnalysisResponse response = service(Optional.of(resolver)).analyze(relaxed);

        assertThat(response.analysisStatus()).isEqualTo(AnalysisStatus.COMPLETE);
    }

    private static FieldsAnalysisService service(
        Optional<FieldMappingResolver> resolver
    ) {
        return new FieldsAnalysisService(
            resolver,
            new FormAnalysisRouter(List.of()),
            new FieldInteractionPolicy(),
            new SupportedProfileFields()
        );
    }

    private static FieldMappingResolver resolver(
        Function<FieldsAnalysisRequest, FieldMappingResolver.Resolution> behavior
    ) {
        return new FieldMappingResolver() {
            @Override
            public Resolution resolve(FieldsAnalysisRequest request) {
                return behavior.apply(request);
            }
        };
    }

    private static Stream<FieldMappingResolver.Resolution> invalidResolverOutputs() {
        List<FieldMappingResolver.Result> valid = List.of(
            new FieldMappingResolver.NoMatch("field-direct"),
            new FieldMappingResolver.NoMatch("field-item")
        );
        return Stream.of(
            null,
            new FieldMappingResolver.Resolution(1, "snapshot-1", valid),
            new FieldMappingResolver.Resolution(2, "another-snapshot", valid),
            new FieldMappingResolver.Resolution(2, "snapshot-1", null),
            new FieldMappingResolver.Resolution(2, "snapshot-1", List.of(
                new FieldMappingResolver.NoMatch("field-direct")
            )),
            new FieldMappingResolver.Resolution(2, "snapshot-1", List.of(
                new FieldMappingResolver.NoMatch("field-direct"),
                new FieldMappingResolver.NoMatch("field-direct")
            )),
            new FieldMappingResolver.Resolution(2, "snapshot-1", List.of(
                new FieldMappingResolver.NoMatch("field-direct"),
                new FieldMappingResolver.NoMatch("unknown-field")
            )),
            new FieldMappingResolver.Resolution(2, "snapshot-1", List.of(
                new FieldMappingResolver.Match("field-direct", "contact.email"),
                new FieldMappingResolver.NoMatch("field-item")
            )),
            new FieldMappingResolver.Resolution(2, "snapshot-1", List.of(
                new FieldMappingResolver.Match(
                    "field-direct",
                    "languages.languageTest.evidenceDocumentPath"
                ),
                new FieldMappingResolver.NoMatch("field-item")
            ))
        );
    }

    private static void assertUnavailable(FieldsAnalysisResponse response) {
        assertThat(response.mode()).isEqualTo(Mode.GENERIC);
        assertThat(response.analysisStatus()).isEqualTo(AnalysisStatus.PARTIAL);
        assertThat(response.warningCodes()).containsExactly(WarningCode.LLM_UNAVAILABLE);
        assertThat(response.fields()).isEmpty();
    }

    private static FieldMappingResolver.Resolution validNoMatchResolution() {
        return new FieldMappingResolver.Resolution(
            2,
            "snapshot-1",
            List.of(
                new FieldMappingResolver.NoMatch("field-item"),
                new FieldMappingResolver.NoMatch("field-direct")
            )
        );
    }

    private static FieldsAnalysisRequest emptyRequest() {
        return new FieldsAnalysisRequest(
            2,
            "snapshot-1",
            site(),
            List.of(section("section-1", null))
        );
    }

    private static FieldsAnalysisRequest request() {
        return new FieldsAnalysisRequest(
            2,
            "snapshot-1",
            site(),
            List.of(new Section(
                "section-1",
                null,
                "기본 정보",
                List.of(field("field-direct")),
                List.of(new Item("item-1", List.of(field("field-item"))))
            ))
        );
    }

    private static Section section(String sectionId, String parentSectionId) {
        return new Section(
            sectionId,
            parentSectionId,
            null,
            List.of(),
            null
        );
    }

    private static FieldCandidate field(String candidateId) {
        return new FieldCandidate(
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

    private static Site site() {
        return new Site("example.test", "/application/*");
    }
}
