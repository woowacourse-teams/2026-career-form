package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.application.FormAnalysisRouter.RouteKind;
import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.CompanyFormAnalysisAdapter;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

@DisplayName("지원서 분석 route")
class FormAnalysisRouterTest {

    @Test
    @DisplayName("회사 어댑터 후보가 아니면 기존 generic route를 유지한다")
    void keepsTheGenericRouteForANonAdapterSite() {
        FormAnalysisRouter router = new FormAnalysisRouter(List.of(
            adapter(false, false)
        ));

        assertThat(router.route(preparationRequest()).kind())
            .isEqualTo(RouteKind.GENERIC);
        assertThat(router.route(fieldsRequest()).kind())
            .isEqualTo(RouteKind.GENERIC);
    }

    @Test
    @DisplayName("회사 후보의 fingerprint가 맞으면 adapter Resolver를 선택한다")
    void selectsTheAdapterResolversForAVerifiedFingerprint() {
        CompanyFormAnalysisAdapter adapter = adapter(true, true);
        FormAnalysisRouter router = new FormAnalysisRouter(List.of(adapter));

        assertThat(router.route(preparationRequest()).resolver())
            .isSameAs(adapter.actionResolver());
        assertThat(router.route(preparationRequest()).kind())
            .isEqualTo(RouteKind.ADAPTER);
        assertThat(router.route(fieldsRequest()).resolver())
            .isSameAs(adapter.fieldMappingResolver());
        assertThat(router.route(fieldsRequest()).kind())
            .isEqualTo(RouteKind.ADAPTER);
    }

    @Test
    @DisplayName("회사 후보의 fingerprint가 다르면 Resolver 없이 mismatch route를 선택한다")
    void blocksAnAdapterCandidateWithAMismatchedFingerprint() {
        FormAnalysisRouter router = new FormAnalysisRouter(List.of(
            adapter(true, false)
        ));

        assertThat(router.route(preparationRequest()).kind())
            .isEqualTo(RouteKind.STRUCTURE_MISMATCH);
        assertThat(router.route(preparationRequest()).resolver()).isNull();
        assertThat(router.route(fieldsRequest()).kind())
            .isEqualTo(RouteKind.STRUCTURE_MISMATCH);
        assertThat(router.route(fieldsRequest()).resolver()).isNull();
    }

    private static CompanyFormAnalysisAdapter adapter(
        boolean candidate,
        boolean fingerprint
    ) {
        ActionResolver actionResolver = request -> new ActionResolver.Resolution(
            request.schemaVersion(),
            request.snapshotId(),
            List.of()
        );
        FieldMappingResolver fieldResolver = request ->
            new FieldMappingResolver.Resolution(
                request.schemaVersion(),
                request.snapshotId(),
                List.of()
            );
        return new CompanyFormAnalysisAdapter() {
            @Override
            public boolean isCandidate(PreparationAnalysisRequest request) {
                return candidate;
            }

            @Override
            public boolean isCandidate(FieldsAnalysisRequest request) {
                return candidate;
            }

            @Override
            public boolean matchesFingerprint(PreparationAnalysisRequest request) {
                return fingerprint;
            }

            @Override
            public boolean matchesFingerprint(FieldsAnalysisRequest request) {
                return fingerprint;
            }

            @Override
            public ActionResolver actionResolver() {
                return actionResolver;
            }

            @Override
            public FieldMappingResolver fieldMappingResolver() {
                return fieldResolver;
            }
        };
    }

    private static PreparationAnalysisRequest preparationRequest() {
        return new PreparationAnalysisRequest(
            2,
            "snapshot-a",
            new PreparationAnalysisRequest.Site("example.test", "/application/*"),
            List.of(new PreparationAnalysisRequest.Section(
                "section-a",
                null,
                null,
                List.of(),
                null
            ))
        );
    }

    private static FieldsAnalysisRequest fieldsRequest() {
        return new FieldsAnalysisRequest(
            2,
            "snapshot-b",
            new FieldsAnalysisRequest.Site("example.test", "/application/*"),
            List.of(new FieldsAnalysisRequest.Section(
                "section-b",
                null,
                null,
                List.of(),
                null
            ))
        );
    }
}
