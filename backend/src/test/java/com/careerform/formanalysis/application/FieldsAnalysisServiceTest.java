package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.domain.AnalysisMode;
import com.careerform.formanalysis.domain.AnalysisStatus;
import com.careerform.formanalysis.domain.AutofillPolicy;
import com.careerform.formanalysis.domain.FieldMappingResolution;
import com.careerform.formanalysis.domain.FieldsAnalysis;
import com.careerform.formanalysis.domain.FieldsSnapshot;
import com.careerform.formanalysis.domain.FormControl;
import com.careerform.formanalysis.domain.FormElement;
import com.careerform.formanalysis.domain.Site;
import com.careerform.formanalysis.domain.Visibility;
import com.careerform.formanalysis.domain.WarningCode;

import tools.jackson.databind.ObjectMapper;

class FieldsAnalysisServiceTest {

    @Test
    void reportsUnavailableWhenResolverIsAbsentEvenWithoutCandidates() {
        FieldsAnalysis analysis = service(Optional.empty()).analyze(emptySnapshot());

        assertUnavailable(analysis);
    }

    @Test
    void doesNotCallAvailableResolverWhenThereAreNoCandidates() {
        AtomicInteger calls = new AtomicInteger();
        FieldMappingResolver resolver = snapshot -> {
            calls.incrementAndGet();
            throw new AssertionError("후보가 없으면 Resolver를 호출하면 안 됩니다");
        };

        FieldsAnalysis analysis = service(Optional.of(resolver))
            .analyze(emptySnapshot());

        assertThat(calls).hasValue(0);
        assertThat(analysis.analysisStatus()).isEqualTo(AnalysisStatus.COMPLETE);
        assertThat(analysis.fields()).isEmpty();
        assertThat(analysis.warningCodes()).isNull();
    }

    @Test
    void mapsEveryFieldInSnapshotTraversalOrder() {
        FieldMappingResolver resolver = ignored -> new FieldMappingResolution(
            2,
            "snapshot-1",
            List.of(
                new FieldMappingResolution.NoMatch("field-item"),
                new FieldMappingResolution.Match(
                    "field-direct",
                    "contact.contact.email"
                )
            )
        );

        FieldsAnalysis analysis = service(Optional.of(resolver)).analyze(snapshot());

        assertThat(analysis.analysisStatus()).isEqualTo(AnalysisStatus.COMPLETE);
        assertThat(analysis.fields()).containsExactly(
            new FieldsAnalysis.MatchedFieldAnalysis(
                "field-direct",
                FieldsAnalysis.MatchType.MATCH,
                "contact.contact.email",
                AutofillPolicy.ALLOWED,
                FieldsAnalysis.MappingStatus.LLM_SUGGESTED,
                FieldsAnalysis.InteractionStatus.READY,
                new FieldsAnalysis.WritePlan(FieldsAnalysis.WriteCommand.SET_TEXT)
            ),
            new FieldsAnalysis.NoMatchFieldAnalysis(
                "field-item",
                FieldsAnalysis.MatchType.NO_MATCH,
                FieldsAnalysis.MappingStatus.LLM_SUGGESTED,
                FieldsAnalysis.InteractionStatus.BLOCKED,
                List.of(FieldsAnalysis.ReasonCode.NO_MATCH)
            )
        );
    }

    @Test
    void treatsAllNoMatchAsCompleteExplicitFieldResults() {
        FieldMappingResolver resolver = ignored -> new FieldMappingResolution(
            2,
            "snapshot-1",
            List.of(
                new FieldMappingResolution.NoMatch("field-item"),
                new FieldMappingResolution.NoMatch("field-direct")
            )
        );

        FieldsAnalysis analysis = service(Optional.of(resolver)).analyze(snapshot());

        assertThat(analysis.analysisStatus()).isEqualTo(AnalysisStatus.COMPLETE);
        assertThat(analysis.fields()).hasSize(2)
            .allMatch(FieldsAnalysis.NoMatchFieldAnalysis.class::isInstance);
        assertThat(analysis.warningCodes()).isNull();
    }

    @Test
    void discardsAllResultsWhenResolverIsUnavailable() {
        FieldMappingResolver resolver = ignored -> {
            throw new ResolverUnavailableException("private-provider-marker");
        };

        FieldsAnalysis analysis = service(Optional.of(resolver)).analyze(snapshot());

        assertUnavailable(analysis);
    }

    @ParameterizedTest
    @MethodSource("invalidResolverOutputs")
    void discardsEveryResultWhenResolverOutputViolatesTheContract(
        FieldMappingResolution invalidOutput
    ) {
        FieldMappingResolver resolver = ignored -> invalidOutput;

        FieldsAnalysis analysis = service(Optional.of(resolver)).analyze(snapshot());

        assertUnavailable(analysis);
    }

    @Test
    void doesNotConvertUnexpectedApplicationBugToLlmUnavailable() {
        FieldMappingResolver resolver = ignored -> {
            throw new IllegalStateException("synthetic-local-bug");
        };

        assertThatThrownBy(() -> service(Optional.of(resolver)).analyze(snapshot()))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("synthetic-local-bug");
    }

    @Test
    void serializesNoMatchWithOnlyTheExternalContractProperties() {
        FieldsAnalysis analysis = FieldsAnalysis.complete(
            "snapshot-1",
            List.of(new FieldsAnalysis.NoMatchFieldAnalysis(
                "field-1",
                FieldsAnalysis.MatchType.NO_MATCH,
                FieldsAnalysis.MappingStatus.LLM_SUGGESTED,
                FieldsAnalysis.InteractionStatus.BLOCKED,
                List.of(FieldsAnalysis.ReasonCode.NO_MATCH)
            ))
        );

        assertThat(new ObjectMapper().writeValueAsString(analysis)).isEqualTo(
            "{\"snapshotId\":\"snapshot-1\",\"mode\":\"GENERIC\","
                + "\"analysisStatus\":\"COMPLETE\",\"fields\":[{"
                + "\"candidateId\":\"field-1\",\"matchType\":\"NO_MATCH\","
                + "\"mappingStatus\":\"LLM_SUGGESTED\","
                + "\"interactionStatus\":\"BLOCKED\","
                + "\"reasonCodes\":[\"NO_MATCH\"]}]}"
        );
    }

    private static FieldsAnalysisService service(
        Optional<FieldMappingResolver> resolver
    ) {
        return new FieldsAnalysisService(
            resolver,
            new SnapshotValidator(),
            new FieldMappingResolutionValidator(),
            new FieldInteractionPolicy()
        );
    }

    private static Stream<FieldMappingResolution> invalidResolverOutputs() {
        List<FieldMappingResolution.Result> valid = List.of(
            new FieldMappingResolution.NoMatch("field-direct"),
            new FieldMappingResolution.NoMatch("field-item")
        );
        return Stream.of(
            new FieldMappingResolution(1, "snapshot-1", valid),
            new FieldMappingResolution(2, "another-snapshot", valid),
            new FieldMappingResolution(2, "snapshot-1", List.of(
                new FieldMappingResolution.NoMatch("field-direct")
            )),
            new FieldMappingResolution(2, "snapshot-1", List.of(
                new FieldMappingResolution.NoMatch("field-direct"),
                new FieldMappingResolution.NoMatch("field-direct")
            )),
            new FieldMappingResolution(2, "snapshot-1", List.of(
                new FieldMappingResolution.NoMatch("field-direct"),
                new FieldMappingResolution.NoMatch("unknown-field")
            )),
            new FieldMappingResolution(2, "snapshot-1", List.of(
                new FieldMappingResolution.Match("field-direct", "contact.email"),
                new FieldMappingResolution.NoMatch("field-item")
            )),
            new FieldMappingResolution(2, "snapshot-1", List.of(
                new FieldMappingResolution.Match(
                    "field-direct",
                    "languages.languageTest.evidenceDocumentPath"
                ),
                new FieldMappingResolution.NoMatch("field-item")
            ))
        );
    }

    private static void assertUnavailable(FieldsAnalysis analysis) {
        assertThat(analysis.mode()).isEqualTo(AnalysisMode.GENERIC);
        assertThat(analysis.analysisStatus()).isEqualTo(AnalysisStatus.PARTIAL);
        assertThat(analysis.warningCodes()).containsExactly(WarningCode.LLM_UNAVAILABLE);
        assertThat(analysis.fields()).isEmpty();
    }

    private static FieldsSnapshot emptySnapshot() {
        return new FieldsSnapshot(
            2,
            "snapshot-1",
            site(),
            List.of(new FieldsSnapshot.Section(
                "section-1",
                null,
                "기본 정보",
                List.of(),
                List.of()
            ))
        );
    }

    private static FieldsSnapshot snapshot() {
        return new FieldsSnapshot(
            2,
            "snapshot-1",
            site(),
            List.of(new FieldsSnapshot.Section(
                "section-1",
                null,
                "기본 정보",
                List.of(field("field-direct")),
                List.of(new FieldsSnapshot.Item(
                    "item-1",
                    List.of(field("field-item"))
                ))
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

    private static Site site() {
        return new Site("example.test", "/application/*");
    }
}
