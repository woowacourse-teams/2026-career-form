package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.dto.InteractionDecisionRequest;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Candidate;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Control;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Decision;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Element;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.RelationToTarget;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Role;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.SemanticContext;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.SemanticLabel;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.SemanticSource;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.TargetKind;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Visibility;

class InteractionObservationProjectorTest {

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "학사·석사·박사|bachelor; master; doctor",
        "전문학사|associate",
        "고등학교 졸업|high school",
        "대학교(4년제)|university",
        "대학원 석사과정|graduate school; master",
        "Bachelor's degree|bachelor",
        "Associate degree|associate",
        "Master|master",
        "PhD SYNTHETIC_NAME_7310|doctor",
        "Doctor of Philosophy|doctor",
        "High School|high school"
    })
    void keepsEducationLevelVocabularyInRowKindOptionLabels(String label, String expected) {
        var projected = project(Role.ROW_KIND_OPTION, label, TargetKind.MASTER);

        assertThat(projected.labels()).extracting(InteractionDecisionProvider.SemanticLabel::text)
            .containsExactly(expected);
    }

    @Test
    void passesTargetKindAndDropsLabelsWithoutEducationVocabulary() {
        InteractionDecisionProvider.Decision decision = projector().project(request(Role.ROW_KIND_OPTION,
            "SYNTHETIC_NAME_7310 2019.03", TargetKind.DOCTOR)).batch().decisions().getFirst();

        assertThat(decision.targetKind()).isEqualTo(TargetKind.DOCTOR);
        assertThat(decision.candidates().getFirst().labels()).isEmpty();
    }

    @Test
    void keepsExistingSanitizerForSearchRoles() {
        assertThat(project(Role.SEARCH_POPUP_OPENER, "석사 학교명 검색", null).labels())
            .extracting(InteractionDecisionProvider.SemanticLabel::text)
            .containsExactly("school name; search");
        assertThat(project(Role.SEARCH_POPUP_OPENER, "내용추가 학력사항 삭제 저장 학교명 검색", null).labels())
            .extracting(InteractionDecisionProvider.SemanticLabel::text)
            .containsExactly("school name; search");
        assertThat(projector().project(request(Role.SEARCH_POPUP_OPENER, "검색", null)).batch().decisions()
            .getFirst().targetKind()).isNull();
    }

    @Test
    void keepsRepeatAddControlAndSectionHeadingAsCanonicalEvidence() {
        Candidate candidate = new Candidate("add-button", Element.BUTTON, Control.BUTTON, Visibility.VISIBLE,
            null, null, null, RelationToTarget.SAME_REPEAT_ROW,
            new SemanticContext(List.of(new SemanticLabel(SemanticSource.LABEL, "내용추가"),
                new SemanticLabel(SemanticSource.SECTION_HEADING, "학력사항* SYNTHETIC_NAME_7310")), null));
        var request = new InteractionDecisionRequest(2, "repeat-snapshot",
            new InteractionDecisionRequest.Site("example.test", "/application"),
            List.of(new Decision("add-row", Role.REPEAT_ADD, "education.university.schoolName", List.of(candidate))));

        var projected = projector().project(request).batch().decisions().getFirst().candidates().getFirst();

        assertThat(projected.labels()).containsExactly(
            new InteractionDecisionProvider.SemanticLabel("label", "add"),
            new InteractionDecisionProvider.SemanticLabel("section-heading", "education"));
        assertThat(projected.relationToTarget()).isEqualTo(RelationToTarget.SAME_REPEAT_ROW);
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "내용추가|add", "행 추가|add", "항목 추가|add", "ADD|add",
        "학력사항*|education", "Education|education", "경력사항|career", "Career|career",
        "자격사항|certificate", "Certification|certificate", "Certificate|certificate",
        "어학사항|language", "Language|language", "프로젝트|project", "Project|project",
        "논문|publication", "Publication|publication", "삭제|delete", "Delete|delete", "Remove|delete",
        "저장|save", "Save|save", "초기화|reset", "Reset|reset"
    })
    void keepsFiniteStructureVocabularyOnlyForStructureActions(String label, String expected) {
        for (Role role : List.of(Role.REPEAT_ADD, Role.SECTION_REVEAL)) {
            assertThat(project(role, label + " SYNTHETIC_NAME_7310", null).labels())
                .extracting(InteractionDecisionProvider.SemanticLabel::text).containsExactly(expected);
        }
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "Address|''", "Additional info|''", "padding|''", "Unsaved|''", "saved-search|search",
        "educational|''", "careers|''", "uncertified|''", "languages|''", "projection|''",
        "publications|''", "deleted|''", "removed|''", "preset|''"
    })
    void rejectsNewEnglishVocabularyInsideOtherWords(String label, String expected) {
        for (Role role : List.of(Role.REPEAT_ADD, Role.SECTION_REVEAL)) {
            var labels = project(role, label, null).labels();
            if (expected.isEmpty()) {
                assertThat(labels).isEmpty();
            }
            else {
                assertThat(labels).extracting(InteractionDecisionProvider.SemanticLabel::text).containsExactly(expected);
            }
        }
    }

    @Test
    void retainsStructureActionsBeforeGenericTermsAtSixTermLimit() {
        for (Role role : List.of(Role.REPEAT_ADD, Role.SECTION_REVEAL)) {
            assertThat(project(role, "학교명 대학교 대학원 고등학교 검색 입력 추가 삭제 저장 초기화 학력", null).labels())
                .extracting(InteractionDecisionProvider.SemanticLabel::text)
                .containsExactly("delete; save; reset; add; education; school name");
        }
        assertThat(project(Role.REPEAT_ADD, "SYNTHETIC_NAME_7310 2019.03", null).labels()).isEmpty();
    }

    private static InteractionDecisionProvider.Candidate project(Role role, String label, TargetKind kind) {
        return projector().project(request(role, label, kind)).batch().decisions().getFirst().candidates().getFirst();
    }

    private static InteractionObservationProjector projector() {
        return new InteractionObservationProjector();
    }

    private static InteractionDecisionRequest request(Role role, String label, TargetKind kind) {
        boolean option = role == Role.ROW_KIND_OPTION;
        Candidate candidate = new Candidate("candidate", option ? Element.SELECT : Element.BUTTON,
            option ? Control.OPTION : Control.BUTTON, Visibility.VISIBLE, null, null, null,
            option ? RelationToTarget.SAME_REPEAT_ROW : RelationToTarget.SAME_FIELD_GROUP,
            new SemanticContext(List.of(new SemanticLabel(SemanticSource.LABEL, label)), null));
        return new InteractionDecisionRequest(2, "projector-snapshot",
            new InteractionDecisionRequest.Site("example.test", "/application"),
            List.of(new Decision("decision", role, "education.university.schoolName", List.of(candidate), kind)));
    }
}
