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

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.ActionCandidate;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Item;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Section;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Site;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Visibility;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse.AddRepeatableGroupPlan;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse.AnalysisStatus;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse.Command;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse.ExpectedEffect;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse.Mode;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse.RevealSectionPlan;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse.WarningCode;
import com.careerform.formanalysis.exception.InvalidSnapshotException;
import com.careerform.formanalysis.exception.ResolverException;

import tools.jackson.databind.ObjectMapper;

@DisplayName("준비 분석 서비스")
class PreparationAnalysisServiceTest {

    @Test
    @DisplayName("Resolver가 없으면 후보가 없어도 PARTIAL 응답을 반환한다")
    void reportsUnavailableWhenResolverIsAbsentEvenWithoutCandidates() {
        PreparationAnalysisResponse response = service(Optional.empty())
            .analyze(emptyRequest());

        assertUnavailable(response);
    }

    @Test
    @DisplayName("후보가 없으면 사용 가능한 Resolver를 호출하지 않는다")
    void doesNotCallAvailableResolverWhenThereAreNoCandidates() {
        AtomicInteger calls = new AtomicInteger();
        ActionResolver resolver = resolver(request -> {
            calls.incrementAndGet();
            throw new AssertionError("후보가 없으면 Resolver를 호출하면 안 됩니다");
        });

        PreparationAnalysisResponse response = service(Optional.of(resolver))
            .analyze(emptyRequest());

        assertThat(calls).hasValue(0);
        assertThat(response.analysisStatus()).isEqualTo(AnalysisStatus.COMPLETE);
        assertThat(response.preparationPlans()).isEmpty();
        assertThat(response.warningCodes()).isNull();
    }

    @Test
    @DisplayName("Resolver 순서와 무관하게 실행 계획을 요청 순서로 반환한다")
    void mapsOnlyActionsInRequestTraversalOrder() {
        ActionResolver resolver = resolver(ignored -> new ActionResolver.Resolution(
            2,
            "snapshot-1",
            List.of(
                new ActionResolver.RevealAction("action-item", "section-target"),
                new ActionResolver.AddAction("action-direct")
            )
        ));

        PreparationAnalysisResponse response = service(Optional.of(resolver))
            .analyze(request());

        assertThat(response.analysisStatus()).isEqualTo(AnalysisStatus.COMPLETE);
        assertThat(response.preparationPlans()).containsExactly(
            new AddRepeatableGroupPlan(
                "action-direct",
                Command.ADD_REPEATABLE_GROUP,
                ExpectedEffect.GROUP_COUNT_INCREMENT
            ),
            new RevealSectionPlan(
                "action-item",
                Command.REVEAL_SECTION,
                ExpectedEffect.TARGET_VISIBLE,
                "section-target"
            )
        );
    }

    @Test
    @DisplayName("모든 판단이 NO_ACTION이면 빈 COMPLETE 응답을 반환한다")
    void treatsAllNoActionAsCompleteEmptyPlans() {
        ActionResolver resolver = resolver(ignored -> validNoActionResolution());

        PreparationAnalysisResponse response = service(Optional.of(resolver))
            .analyze(request());

        assertThat(response.analysisStatus()).isEqualTo(AnalysisStatus.COMPLETE);
        assertThat(response.preparationPlans()).isEmpty();
        assertThat(response.warningCodes()).isNull();
    }

    @Test
    @DisplayName("Resolver 장애가 발생하면 결과 전체를 버리고 PARTIAL로 반환한다")
    void discardsAllResultsWhenResolverIsUnavailable() {
        ActionResolver resolver = resolver(ignored -> {
            throw new ResolverException("private-provider-marker");
        });

        PreparationAnalysisResponse response = service(Optional.of(resolver))
            .analyze(request());

        assertUnavailable(response);
    }

    @ParameterizedTest
    @MethodSource("invalidResolverOutputs")
    @DisplayName("Resolver 출력 계약이 어긋나면 결과 전체를 폐기한다")
    void discardsEveryResultWhenResolverOutputViolatesTheContract(
        ActionResolver.Resolution invalidOutput
    ) {
        ActionResolver resolver = resolver(ignored -> invalidOutput);

        PreparationAnalysisResponse response = service(Optional.of(resolver))
            .analyze(request());

        assertUnavailable(response);
    }

    @ParameterizedTest
    @MethodSource("ineligibleDirectActions")
    @DisplayName("실행할 수 없는 후보의 action 판단은 결과 전체를 폐기한다")
    void discardsActionForAnIneligibleCandidate(ActionCandidate ineligibleAction) {
        ActionResolver resolver = resolver(ignored -> new ActionResolver.Resolution(
            2,
            "snapshot-1",
            List.of(
                new ActionResolver.AddAction("action-direct"),
                new ActionResolver.NoAction("action-item")
            )
        ));

        PreparationAnalysisResponse response = service(Optional.of(resolver))
            .analyze(request(ineligibleAction));

        assertUnavailable(response);
    }

    @Test
    @DisplayName("애플리케이션 버그는 LLM 장애로 숨기지 않는다")
    void doesNotConvertUnexpectedApplicationBugToLlmUnavailable() {
        ActionResolver resolver = resolver(ignored -> {
            throw new IllegalStateException("synthetic-local-bug");
        });

        assertThatThrownBy(() -> service(Optional.of(resolver)).analyze(request()))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("synthetic-local-bug");
    }

    @Test
    @DisplayName("preparation 성공 응답을 외부 JSON 계약 그대로 직렬화한다")
    void serializesRevealPlanWithOnlyTheExternalContractProperties() {
        PreparationAnalysisResponse response = PreparationAnalysisResponse.complete(
            "snapshot-1",
            List.of(new RevealSectionPlan(
                "action-1",
                Command.REVEAL_SECTION,
                ExpectedEffect.TARGET_VISIBLE,
                "section-target"
            ))
        );

        assertThat(new ObjectMapper().writeValueAsString(response)).isEqualTo(
            "{\"snapshotId\":\"snapshot-1\",\"mode\":\"GENERIC\","
                + "\"analysisStatus\":\"COMPLETE\",\"preparationPlans\":[{"
                + "\"actionCandidateId\":\"action-1\","
                + "\"command\":\"REVEAL_SECTION\","
                + "\"expectedEffect\":\"TARGET_VISIBLE\","
                + "\"targetSectionId\":\"section-target\"}]}"
        );
    }

    @Test
    @DisplayName("준비 응답의 예약 enum wire 값을 유지한다")
    void retainsReservedResponseEnumValues() {
        assertThat(Mode.values()).containsExactly(Mode.ADAPTER, Mode.GENERIC);
        assertThat(WarningCode.values()).containsExactly(
            WarningCode.MANUAL_REVEAL_REQUIRED,
            WarningCode.LLM_UNAVAILABLE
        );
    }

    @Test
    @DisplayName("준비 snapshot의 candidate ID 중복을 거부한다")
    void rejectsDuplicateCandidateIds() {
        PreparationAnalysisRequest duplicate = new PreparationAnalysisRequest(
            2,
            "snapshot-1",
            site(),
            List.of(new Section(
                "section-actions",
                null,
                null,
                List.of(action("same-action")),
                List.of(new Item("item-1", List.of(action("same-action"))))
            ))
        );

        assertThatThrownBy(() -> service(Optional.empty()).analyze(duplicate))
            .isInstanceOf(InvalidSnapshotException.class);
    }

    @Test
    @DisplayName("준비 snapshot의 section ID 중복을 거부한다")
    void rejectsDuplicateSectionIds() {
        PreparationAnalysisRequest duplicate = new PreparationAnalysisRequest(
            2,
            "snapshot-1",
            site(),
            List.of(
                section("same-section", null),
                section("same-section", null)
            )
        );

        assertThatThrownBy(() -> service(Optional.empty()).analyze(duplicate))
            .isInstanceOf(InvalidSnapshotException.class);
    }

    @Test
    @DisplayName("parent 관계와 item ID 중복은 프론트가 정제한 snapshot을 신뢰한다")
    void acceptsParentRelationshipsAndDuplicateItemIds() {
        PreparationAnalysisRequest relaxed = new PreparationAnalysisRequest(
            2,
            "snapshot-1",
            site(),
            List.of(
                section("missing-parent", "unknown-section", "same-item"),
                section("self-parent", "self-parent", "same-item"),
                section("cycle-a", "cycle-b", null),
                section("cycle-b", "cycle-a", null)
            )
        );

        PreparationAnalysisResponse response = service(Optional.of(
            resolver(ignored -> new ActionResolver.Resolution(2, "snapshot-1", List.of()))
        )).analyze(relaxed);

        assertThat(response.analysisStatus()).isEqualTo(AnalysisStatus.COMPLETE);
    }

    private static PreparationAnalysisService service(Optional<ActionResolver> resolver) {
        return new PreparationAnalysisService(resolver);
    }

    private static ActionResolver resolver(
        Function<PreparationAnalysisRequest, ActionResolver.Resolution> behavior
    ) {
        return new ActionResolver() {
            @Override
            public Resolution resolve(PreparationAnalysisRequest request) {
                return behavior.apply(request);
            }
        };
    }

    private static Stream<ActionResolver.Resolution> invalidResolverOutputs() {
        List<ActionResolver.Result> valid = List.of(
            new ActionResolver.NoAction("action-direct"),
            new ActionResolver.NoAction("action-item")
        );
        return Stream.of(
            null,
            new ActionResolver.Resolution(1, "snapshot-1", valid),
            new ActionResolver.Resolution(2, "another-snapshot", valid),
            new ActionResolver.Resolution(2, "snapshot-1", null),
            new ActionResolver.Resolution(2, "snapshot-1", List.of(
                new ActionResolver.NoAction("action-direct")
            )),
            new ActionResolver.Resolution(2, "snapshot-1", List.of(
                new ActionResolver.NoAction("action-direct"),
                new ActionResolver.NoAction("action-direct")
            )),
            new ActionResolver.Resolution(2, "snapshot-1", List.of(
                new ActionResolver.NoAction("action-direct"),
                new ActionResolver.NoAction("unknown-action")
            )),
            new ActionResolver.Resolution(2, "snapshot-1", List.of(
                new ActionResolver.RevealAction("action-direct", "missing-section"),
                new ActionResolver.NoAction("action-item")
            ))
        );
    }

    private static Stream<ActionCandidate> ineligibleDirectActions() {
        return Stream.of(
            action("action-direct", Visibility.HIDDEN, null, null, null),
            action("action-direct", Visibility.VISIBLE, true, null, null),
            action("action-direct", Visibility.VISIBLE, null, true, null),
            action("action-direct", Visibility.VISIBLE, null, null, true)
        );
    }

    private static void assertUnavailable(PreparationAnalysisResponse response) {
        assertThat(response.mode()).isEqualTo(Mode.GENERIC);
        assertThat(response.analysisStatus()).isEqualTo(AnalysisStatus.PARTIAL);
        assertThat(response.warningCodes()).containsExactly(WarningCode.LLM_UNAVAILABLE);
        assertThat(response.preparationPlans()).isEmpty();
    }

    private static ActionResolver.Resolution validNoActionResolution() {
        return new ActionResolver.Resolution(
            2,
            "snapshot-1",
            List.of(
                new ActionResolver.NoAction("action-item"),
                new ActionResolver.NoAction("action-direct")
            )
        );
    }

    private static PreparationAnalysisRequest emptyRequest() {
        return new PreparationAnalysisRequest(
            2,
            "snapshot-1",
            site(),
            List.of(section("section-actions", null))
        );
    }

    private static PreparationAnalysisRequest request() {
        return request(action("action-direct"));
    }

    private static PreparationAnalysisRequest request(ActionCandidate directAction) {
        return new PreparationAnalysisRequest(
            2,
            "snapshot-1",
            site(),
            List.of(
                new Section(
                    "section-actions",
                    null,
                    "버튼",
                    List.of(directAction),
                    List.of(new Item("item-1", List.of(action("action-item"))))
                ),
                section("section-target", "section-actions")
            )
        );
    }

    private static Section section(String sectionId, String parentSectionId) {
        return section(sectionId, parentSectionId, null);
    }

    private static Section section(
        String sectionId,
        String parentSectionId,
        String itemId
    ) {
        return new Section(
            sectionId,
            parentSectionId,
            null,
            List.of(),
            itemId == null ? null : List.of(new Item(itemId, List.of()))
        );
    }

    private static ActionCandidate action(String candidateId) {
        return action(candidateId, Visibility.VISIBLE, null, null, null);
    }

    private static ActionCandidate action(
        String candidateId,
        Visibility visibility,
        Boolean disabled,
        Boolean readonly,
        Boolean inert
    ) {
        return new ActionCandidate(
            candidateId,
            FormElement.BUTTON,
            FormControl.BUTTON,
            visibility,
            "합성 버튼",
            null,
            null,
            disabled,
            readonly,
            inert
        );
    }

    private static Site site() {
        return new Site("example.test", "/application/*");
    }
}
