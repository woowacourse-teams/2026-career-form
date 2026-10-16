package com.careerform.formanalysis.generic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.policy.CompanyFormPolicyFixture;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.exception.ResolverException;
import com.careerform.formanalysis.exception.TokenLimitExceeded;
import com.careerform.formanalysis.generic.SectionClassificationRequest.ControlKind;
import com.careerform.formanalysis.generic.SectionClassificationRequest.Section;
import com.careerform.formanalysis.generic.SectionClassificationResponse.Status;

@DisplayName("범용 섹션 분류 서비스")
class SectionClassificationServiceTest {

    private static final String SYNTHETIC_VALUE = "SYNTHETIC_PRIVATE_8421";

    @Test
    @DisplayName("정적 정책 사이트는 분류기를 호출하지 않고 STATIC_POLICY_PRESENT를 반환한다")
    void staticPolicySiteShortCircuitsWithoutClassifier() {
        var calls = new ArrayList<List<SectionClassifier.SectionShape>>();
        var response = service((host, path) -> new CompanyFormPolicyProvider.Available(CompanyFormPolicyFixture.sk()),
            sections -> { calls.add(sections); return Map.of(); }).classify(request());

        assertThat(calls).isEmpty();
        assertThat(response.status()).isEqualTo(Status.STATIC_POLICY_PRESENT);
        assertThat(response.snapshotId()).isEqualTo("synthetic-snapshot");
        assertThat(response.sections()).isEmpty();
    }

    @Test
    @DisplayName("정책 조회 불가 요청은 분류기를 호출하지 않고 POLICY_UNAVAILABLE을 반환한다")
    void unavailablePolicyShortCircuitsWithoutClassifier() {
        var calls = new ArrayList<List<SectionClassifier.SectionShape>>();
        var response = service((host, path) -> new CompanyFormPolicyProvider.Unavailable(),
            sections -> { calls.add(sections); return Map.of(); }).classify(request());

        assertThat(calls).isEmpty();
        assertThat(response.status()).isEqualTo(Status.POLICY_UNAVAILABLE);
        assertThat(response.sections()).isEmpty();
    }

    @Test
    @DisplayName("분류 결과를 요청 섹션 순서로 돌려주고 누락된 섹션만 ABSTAIN으로 채운다")
    void returnsClassificationsInRequestOrderAndAbstainsMissingSections() {
        var response = service(notRegistered(), sections -> Map.of(
            "education", new SectionClassifier.Classification("EDUCATION", 0.93)))
            .classify(request());

        assertThat(response.status()).isEqualTo(Status.COMPLETE);
        assertThat(response.sections()).containsExactly(
            new SectionClassificationResponse.Section("education", "EDUCATION", 0.93),
            new SectionClassificationResponse.Section("language", "ABSTAIN", 0.0));
    }

    @Test
    @DisplayName("JEV 장애와 토큰 한도 초과는 전체 실패 대신 섹션을 ABSTAIN으로 응답한다")
    void providerFailureAbstainsSectionsInsteadOfFailingTheRequest() {
        for (RuntimeException failure : List.of(new ResolverException("synthetic"), new TokenLimitExceeded())) {
            var response = service(notRegistered(), sections -> { throw failure; }).classify(request());

            assertThat(response.status()).isEqualTo(Status.COMPLETE);
            assertThat(response.sections()).extracting(SectionClassificationResponse.Section::category)
                .containsExactly("ABSTAIN", "ABSTAIN");
        }
    }

    @Test
    @DisplayName("분류기가 없거나 범주 밖 결과를 내면 ABSTAIN으로 응답한다")
    void missingClassifierOrUnknownCategoryAbstains() {
        var withoutClassifier = new SectionClassificationService(Optional.empty(),
            new FormAnalysisRouter(notRegistered()), new SectionCategories(new com.careerform.formanalysis.application.SupportedProfileFields()))
            .classify(request());
        assertThat(withoutClassifier.sections()).extracting(SectionClassificationResponse.Section::category)
            .containsExactly("ABSTAIN", "ABSTAIN");

        var unknown = service(notRegistered(), sections -> Map.of(
            "education", new SectionClassifier.Classification("HOBBY", 0.9),
            "language", new SectionClassifier.Classification("LANGUAGE", Double.NaN))).classify(request());
        assertThat(unknown.sections()).extracting(SectionClassificationResponse.Section::category)
            .containsExactly("ABSTAIN", "ABSTAIN");
    }

    @Test
    @DisplayName("분류기에는 정제된 라벨과 제목만 전달한다")
    void passesOnlySanitizedSemanticLabelsToClassifier() {
        var calls = new ArrayList<List<SectionClassifier.SectionShape>>();
        service(notRegistered(), sections -> { calls.add(sections); return Map.of(); }).classify(request());

        var education = calls.getFirst().getFirst();
        assertThat(education.title()).isEqualTo("education");
        assertThat(education.labels()).containsExactly("school name", "major name");
        assertThat(calls.getFirst().toString()).doesNotContain(SYNTHETIC_VALUE);
        assertThat(calls.getFirst().get(1).parentSectionId()).isNull();
        assertThat(education.controlKinds()).containsExactly(ControlKind.TEXT, ControlKind.SELECT);
    }

    @Test
    @DisplayName("섹션 id 중복, 없는 부모 참조, 지원하지 않는 schemaVersion은 거부한다")
    void rejectsInvalidSectionStructure() {
        var service = service(notRegistered(), sections -> Map.of());
        var duplicate = new SectionClassificationRequest(1, "synthetic-snapshot", site(), List.of(
            section("same", null), section("same", null)));
        var orphan = new SectionClassificationRequest(1, "synthetic-snapshot", site(), List.of(
            section("child", "missing")));
        var version = new SectionClassificationRequest(2, "synthetic-snapshot", site(), List.of(
            section("one", null)));

        for (var invalid : List.of(duplicate, orphan, version))
            assertThatThrownBy(() -> service.classify(invalid)).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    @DisplayName("요청 DTO에는 프로필 값, 현재 입력값, 항목 개수 필드가 없다")
    void requestDtoHasNoValueFields() {
        Set<String> components = componentNames(SectionClassificationRequest.class);
        components.addAll(componentNames(SectionClassificationRequest.Section.class));
        components.addAll(componentNames(SectionClassificationRequest.Site.class));

        assertThat(components).containsExactlyInAnyOrder("schemaVersion", "snapshotId", "site", "sections",
            "host", "pathPattern", "sectionId", "parentSectionId", "title", "labels", "controlKinds", "repeated");
        assertThat(components).noneMatch(name -> name.toLowerCase().contains("value")
            || name.toLowerCase().contains("count") || name.toLowerCase().contains("profile"));
    }

    private static Set<String> componentNames(Class<?> type) {
        return Arrays.stream(type.getRecordComponents()).map(java.lang.reflect.RecordComponent::getName)
            .collect(Collectors.toCollection(java.util.HashSet::new));
    }

    private static SectionClassificationService service(CompanyFormPolicyProvider policies, SectionClassifier classifier) {
        return new SectionClassificationService(Optional.of(classifier), new FormAnalysisRouter(policies),
            new SectionCategories(new com.careerform.formanalysis.application.SupportedProfileFields()));
    }

    private static CompanyFormPolicyProvider notRegistered() {
        return (host, path) -> new CompanyFormPolicyProvider.NotRegistered();
    }

    private static SectionClassificationRequest.Site site() {
        return new SectionClassificationRequest.Site("example.test", "/application");
    }

    private static SectionClassificationRequest request() {
        return new SectionClassificationRequest(1, "synthetic-snapshot", site(), List.of(
            new Section("education", null, "학력 " + SYNTHETIC_VALUE,
                List.of("학교명 " + SYNTHETIC_VALUE, "주전공명", SYNTHETIC_VALUE),
                List.of(ControlKind.TEXT, ControlKind.SELECT), true),
            new Section("language", null, "외국어", List.of("시험명", "등급"), List.of(ControlKind.TEXT), false)));
    }

    private static Section section(String id, String parent) {
        return new Section(id, parent, null, List.of("학교명"), List.of(ControlKind.TEXT), false);
    }
}
