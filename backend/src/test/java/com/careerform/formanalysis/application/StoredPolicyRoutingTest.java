package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import com.careerform.formanalysis.application.FormAnalysisRouter.RouteKind;
import com.careerform.formanalysis.application.policy.CompanyFormPolicyFixture;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Available;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.NotRegistered;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Unavailable;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence.Decision;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse;

import tools.jackson.databind.ObjectMapper;

@DisplayName("저장 정책 기반 지원서 분석 route")
class StoredPolicyRoutingTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("미등록 회사는 generic route로 보낸다")
    void routesAnUnregisteredCompanyToGeneric() throws Exception {
        FormAnalysisRouter router = new FormAnalysisRouter(
            (host, path) -> new NotRegistered()
        );

        assertThat(router.route(preparation("sk-preparation-current-v2.json")).kind())
            .isEqualTo(RouteKind.GENERIC);
        assertThat(router.route(fields("sk-fields-current-v2.json")).kind())
            .isEqualTo(RouteKind.GENERIC);
    }

    @Test
    @DisplayName("활성 정책과 fingerprint가 맞으면 adapter route로 보낸다")
    void routesAVerifiedActivePolicyToAdapter() throws Exception {
        FormAnalysisRouter router = new FormAnalysisRouter(
            (host, path) -> new Available(CompanyFormPolicyFixture.sk())
        );

        assertThat(router.route(preparation("sk-preparation-current-v2.json")).kind())
            .isEqualTo(RouteKind.ADAPTER);
        assertThat(router.route(fields("sk-fields-current-v2.json")).kind())
            .isEqualTo(RouteKind.ADAPTER);
    }

    @Test
    @DisplayName("등록 회사의 구조 불일치와 정책 조회 실패를 구분한다")
    void distinguishesMismatchFromUnavailablePolicy() throws Exception {
        FormAnalysisRouter available = new FormAnalysisRouter(
            (host, path) -> new Available(CompanyFormPolicyFixture.sk())
        );
        FormAnalysisRouter unavailable = new FormAnalysisRouter(
            (host, path) -> new Unavailable()
        );

        assertThat(available.route(preparation(
            "sk-preparation-structure-mismatch-v2.json"
        )).kind()).isEqualTo(RouteKind.STRUCTURE_MISMATCH);
        assertThat(available.route(fields(
            "sk-fields-structure-mismatch-v2.json"
        )).kind()).isEqualTo(RouteKind.STRUCTURE_MISMATCH);
        assertThat(unavailable.route(preparation(
            "sk-preparation-current-v2.json"
        )).kind()).isEqualTo(RouteKind.POLICY_UNAVAILABLE);
        assertThat(unavailable.route(fields(
            "sk-fields-current-v2.json"
        )).kind()).isEqualTo(RouteKind.POLICY_UNAVAILABLE);
    }

    @Test
    @DisplayName("기존 회사가 먼저 적용되고, Greeting 연결 증거가 없으면 범용으로 유지한다")
    void preservesCompanyPriorityAndNoEvidenceGenericFallback() throws Exception {
        FormAnalysisRouter company = new FormAnalysisRouter(
            (host, path) -> new Available(CompanyFormPolicyFixture.sk()),
            (host, path) -> { throw new AssertionError("registered company must win"); },
            () -> { throw new AssertionError("registered company must win"); }
        );
        assertThat(company.route(preparation("sk-preparation-current-v2.json")).kind())
            .isEqualTo(RouteKind.ADAPTER);

        FormAnalysisRouter noEvidence = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> Decision.NO_POSITIVE_EVIDENCE,
            () -> { throw new AssertionError("no positive evidence"); }
        );
        assertThat(noEvidence.route(preparation("sk-preparation-current-v2.json")).kind())
            .isEqualTo(RouteKind.GENERIC);
    }

    @Test
    @DisplayName("Greeting 연결 확인 뒤 정책 부재와 DNS 오류는 범용으로 낮추지 않는다")
    void blocksConfirmedGreetingWithoutPolicyAndRetryableDnsFailure() throws Exception {
        FormAnalysisRouter confirmed = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> Decision.POSITIVE,
            Unavailable::new
        );
        FormAnalysisRouter dnsFailure = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> Decision.RETRYABLE_FAILURE,
            () -> { throw new AssertionError("DNS failure must not load a policy"); }
        );

        assertThat(confirmed.route(preparation("sk-preparation-current-v2.json")).kind())
            .isEqualTo(RouteKind.POLICY_UNAVAILABLE);
        assertThat(dnsFailure.route(fields("sk-fields-current-v2.json")).kind())
            .isEqualTo(RouteKind.DNS_UNAVAILABLE);

        PreparationAnalysisResponse response = new PreparationAnalysisService(
            Optional.empty(), dnsFailure
        ).analyze(preparation("sk-preparation-current-v2.json"));
        assertThat(response.mode()).isEqualTo(PreparationAnalysisResponse.Mode.ADAPTER);
        assertThat(response.analysisStatus())
            .isEqualTo(PreparationAnalysisResponse.AnalysisStatus.BLOCKED);
        assertThat(response.blockCode())
            .isEqualTo(PreparationAnalysisResponse.BlockCode.GREETING_DNS_UNAVAILABLE);
    }

    @Test
    @DisplayName("확인된 Greeting 정책이 없어도 준비 단계의 차단 근거를 필드 단계까지 유지한다")
    void preservesConfirmedGreetingWhenPolicyIsUnavailable() throws Exception {
        AtomicReference<Decision> dns = new AtomicReference<>(Decision.POSITIVE);
        GreetingRoutingContext contexts = new GreetingRoutingContext();
        FormAnalysisRouter router = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> dns.get(),
            Unavailable::new,
            contexts
        );
        var preparation = preparation("greeting-preparation-current-v2.json");
        var fixtureFields = fields("greeting-fields-current-v2.json");

        var blocked = new PreparationAnalysisService(Optional.empty(), router, contexts)
            .analyze(preparation, false, true);
        assertThat(blocked.blockCode())
            .isEqualTo(PreparationAnalysisResponse.BlockCode.ADAPTER_POLICY_UNAVAILABLE);
        assertThat(blocked.routingContext()).matches("[A-Za-z0-9_-]{32}");

        dns.set(Decision.NO_POSITIVE_EVIDENCE);
        var fieldsRequest = new FieldsAnalysisRequest(
            fixtureFields.schemaVersion(), fixtureFields.snapshotId(),
            fixtureFields.site(), fixtureFields.sections(), blocked.routingContext()
        );
        assertThat(router.route(fieldsRequest).kind())
            .isEqualTo(RouteKind.POLICY_UNAVAILABLE);
    }

    @Test
    @DisplayName("구버전 클라이언트에서도 이전 Greeting 양성 판정을 범용으로 낮추지 않는다")
    void blocksLegacyFieldAnalysisAfterPositiveEvidenceDisappears() throws Exception {
        AtomicReference<Decision> dns = new AtomicReference<>(Decision.POSITIVE);
        GreetingRoutingContext contexts = new GreetingRoutingContext();
        FormAnalysisRouter router = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> dns.get(),
            () -> new Available(CompanyFormPolicyFixture.greeting()),
            contexts
        );

        var preparationRequest = preparation("greeting-preparation-current-v2.json");
        var preparation = new PreparationAnalysisService(Optional.empty(), router, contexts)
            .analyze(preparationRequest, false, false);
        assertThat(preparation.analysisStatus())
            .isEqualTo(PreparationAnalysisResponse.AnalysisStatus.BLOCKED);
        assertThat(preparation.routingContext()).isNull();

        dns.set(Decision.NO_POSITIVE_EVIDENCE);
        var fixtureFields = fields("greeting-fields-current-v2.json");
        var fieldsRequest = new FieldsAnalysisRequest(
            fixtureFields.schemaVersion(), fixtureFields.snapshotId(),
            new FieldsAnalysisRequest.Site(
                preparationRequest.site().host(), preparationRequest.site().pathPattern()),
            fixtureFields.sections()
        );
        assertThat(router.route(fieldsRequest).kind())
            .isEqualTo(RouteKind.DNS_UNAVAILABLE);
    }

    @Test
    @DisplayName("양성 근거 보관 한도가 차도 새 기본 도메인은 처리하고 자체 도메인은 안전하게 차단한다")
    void handlesPositiveMemoryOverflowWithoutGenericFallback() throws Exception {
        GreetingRoutingContext contexts = new GreetingRoutingContext();
        for (int index = 0; index < 4_096; index++) {
            assertThat(contexts.rememberPositive(
                "career" + index + ".example.org", "/ko/o/*/apply"
            )).isTrue();
        }
        FormAnalysisRouter custom = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> Decision.POSITIVE,
            () -> new Available(CompanyFormPolicyFixture.greeting()),
            contexts
        );
        var fixture = preparation("greeting-preparation-current-v2.json");
        var newCustom = new PreparationAnalysisRequest(
            fixture.schemaVersion(), fixture.snapshotId(),
            new PreparationAnalysisRequest.Site(
                "career.new-company.example.org", fixture.site().pathPattern()),
            fixture.sections()
        );
        var blocked = new PreparationAnalysisService(Optional.empty(), custom, contexts)
            .analyze(newCustom, false, true);
        assertThat(blocked.analysisStatus())
            .isEqualTo(PreparationAnalysisResponse.AnalysisStatus.BLOCKED);
        assertThat(blocked.routingContext()).isNull();

        FormAnalysisRouter stable = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> Decision.POSITIVE_STABLE,
            () -> new Available(CompanyFormPolicyFixture.greeting()),
            contexts
        );
        assertThat(stable.route(fixture).kind()).isEqualTo(RouteKind.ADAPTER);

        FormAnalysisRouter unrelatedPage = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> Decision.OUT_OF_SCOPE,
            () -> { throw new AssertionError("out-of-scope page must not load Greeting"); },
            contexts
        );
        assertThat(unrelatedPage.route(fixture).kind()).isEqualTo(RouteKind.GENERIC);

        FormAnalysisRouter unrelatedHost = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> Decision.NO_POSITIVE_EVIDENCE,
            () -> { throw new AssertionError("unrelated host must not load Greeting"); },
            contexts
        );
        var unrelated = new PreparationAnalysisRequest(
            fixture.schemaVersion(), fixture.snapshotId(),
            new PreparationAnalysisRequest.Site(
                "careers.unrelated.org", fixture.site().pathPattern()),
            fixture.sections()
        );
        assertThat(unrelatedHost.route(unrelated).kind()).isEqualTo(RouteKind.GENERIC);
    }

    @Test
    @DisplayName("두 도메인의 Greeting 정책은 action 없이 준비하고 정확한 필드만 정적으로 분류한다")
    void routesVerifiedGreetingPolicyWithIndependentFieldFingerprint() throws Exception {
        GreetingRoutingContext contexts = new GreetingRoutingContext();
        FormAnalysisRouter router = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> Decision.POSITIVE,
            () -> new Available(CompanyFormPolicyFixture.greeting()),
            contexts
        );

        var preparation = preparation("greeting-preparation-current-v2.json");
        var fixtureFields = fields("greeting-fields-current-v2.json");
        var fields = new FieldsAnalysisRequest(
            fixtureFields.schemaVersion(), fixtureFields.snapshotId(),
            fixtureFields.site(), fixtureFields.sections(),
            contexts.issue(fixtureFields.site().host(), fixtureFields.site().pathPattern())
        );
        assertThat(router.route(preparation).kind()).isEqualTo(RouteKind.ADAPTER);
        PreparationAnalysisService preparationService = new PreparationAnalysisService(
            Optional.empty(), router, contexts
        );
        var supported = preparationService.analyze(preparation, false, true);
        assertThat(supported.preparationPlans()).isEmpty();
        assertThat(supported.routingContext()).matches("[A-Za-z0-9_-]{32}");
        var legacy = preparationService.analyze(preparation, false, false);
        assertThat(legacy.analysisStatus())
            .isEqualTo(PreparationAnalysisResponse.AnalysisStatus.BLOCKED);
        assertThat(legacy.blockCode())
            .isEqualTo(PreparationAnalysisResponse.BlockCode.ADAPTER_POLICY_UNAVAILABLE);
        assertThat(router.route(fields).kind()).isEqualTo(RouteKind.ADAPTER);
        assertThat(router.route(fields).resolver().resolve(fields).results())
            .containsExactly(
                new FieldMappingResolver.Match("name",
                    new FieldMappingResolver.DerivedBinding(
                        FieldMappingResolver.DerivedRecipe.KOREAN_FULL_NAME)),
                new FieldMappingResolver.Match("phone",
                    new FieldMappingResolver.DirectBinding("contact.contact.phoneNumber")),
                new FieldMappingResolver.NoMatch("school-search")
            );

        var changed = new FieldsAnalysisRequest(
            fields.schemaVersion(), fields.snapshotId(), fields.site(),
            java.util.List.of(new FieldsAnalysisRequest.Section(
                "section-root", null, null,
                java.util.List.of(fields.sections().getFirst().fields().getFirst()), null
            )), fields.routingContext()
        );
        assertThat(router.route(changed).kind()).isEqualTo(RouteKind.STRUCTURE_MISMATCH);

        var duplicate = new FieldsAnalysisRequest(
            fields.schemaVersion(), fields.snapshotId(), fields.site(),
            java.util.List.of(new FieldsAnalysisRequest.Section(
                "section-root", null, null,
                java.util.List.of(
                    fields.sections().getFirst().fields().getFirst(),
                    fields.sections().getFirst().fields().getFirst(),
                    fields.sections().getFirst().fields().get(1)
                ), null
            )), fields.routingContext()
        );
        assertThat(router.route(duplicate).kind()).isEqualTo(RouteKind.STRUCTURE_MISMATCH);
    }

    @Test
    @DisplayName("준비에서 확인한 Greeting은 이후 DNS 근거가 사라져도 범용으로 낮아지지 않는다")
    void preservesGreetingWithBoundRoutingContext() throws Exception {
        AtomicReference<Decision> dns = new AtomicReference<>(Decision.POSITIVE);
        GreetingRoutingContext contexts = new GreetingRoutingContext();
        FormAnalysisRouter router = new FormAnalysisRouter(
            (host, path) -> new NotRegistered(),
            (host, path) -> dns.get(),
            () -> new Available(CompanyFormPolicyFixture.greeting()),
            contexts
        );
        var preparation = preparation("greeting-preparation-current-v2.json");
        var fields = fields("greeting-fields-current-v2.json");
        assertThat(router.route(preparation).kind()).isEqualTo(RouteKind.ADAPTER);
        String token = contexts.issue(fields.site().host(), fields.site().pathPattern());
        dns.set(Decision.NO_POSITIVE_EVIDENCE);

        var withContext = new FieldsAnalysisRequest(
            fields.schemaVersion(), fields.snapshotId(), fields.site(),
            fields.sections(), token
        );
        assertThat(router.route(withContext).kind()).isEqualTo(RouteKind.ADAPTER);
        assertThat(router.route(new FieldsAnalysisRequest(
            fields.schemaVersion(), fields.snapshotId(), fields.site(),
            fields.sections(), "forged"
        )).kind()).isEqualTo(RouteKind.POLICY_UNAVAILABLE);
        dns.set(Decision.POSITIVE);
        assertThat(router.route(fields).kind()).isEqualTo(RouteKind.POLICY_UNAVAILABLE);
    }

    private PreparationAnalysisRequest preparation(String name) throws Exception {
        return objectMapper.readValue(fixture(name), PreparationAnalysisRequest.class);
    }

    private FieldsAnalysisRequest fields(String name) throws Exception {
        return objectMapper.readValue(fixture(name), FieldsAnalysisRequest.class);
    }

    private static String fixture(String name) throws Exception {
        return new ClassPathResource("formanalysis/" + name)
            .getContentAsString(StandardCharsets.UTF_8);
    }
}
