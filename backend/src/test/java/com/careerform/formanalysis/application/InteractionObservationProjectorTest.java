package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

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
    @EnumSource(value = Role.class, names = {"SEARCH_POPUP_OPENER", "SEARCH_QUERY_INPUT", "SEARCH_SUBMIT",
        "REPEAT_ADD", "SECTION_REVEAL", "ROW_KIND_OPTION"})
    void preservesUnregisteredPageTextForLabelBearingRoles(Role role) {
        assertThat(project(role, "항목 더 만들기", null).labels())
            .containsExactly(new InteractionDecisionProvider.SemanticLabel("label", "항목 더 만들기"));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "학사·석사·박사|학사·석사·박사", "전문대학|전문대학", "고등학교 졸업|고등학교 졸업",
        "대학교(4년제)|대학교(4년제)", "대학원(석사)|대학원(석사)", "대학원(박사)|대학원(박사)",
        "Bachelor's degree|Bachelor's degree", "SYNTHETIC_NAME_7310 2019.03|SYNTHETIC_NAME_<number> <number>.<number>",
        "문의 qa@example.test|문의 <email>", "문의 QA+tag@EXAMPLE.test|문의 <email>",
        "열기 https://example.test/path?q=123|열기 <url>", "열기 www.example.test/123|열기 <url>",
        "열기 HTTP://example.test/a|열기 <url>",
        "연락 +82 10-1234-5678|연락 <number>", "연락 (010) 1234-5678|연락 <number>",
        "연락 01012345678|연락 <number>", "식별자 AB1234 날짜 2026-10-20|식별자 AB<number> 날짜 <number>",
        "추가 １ １２ ４년제|추가 1 <number> 4년제"
    })
    void masksPatternsWithoutFilteringOtherPageText(String label, String expected) {
        assertThat(project(Role.ROW_KIND_OPTION, label, TargetKind.BACHELOR).labels())
            .extracting(InteractionDecisionProvider.SemanticLabel::text).containsExactly(expected);
    }

    @Test
    void normalizesWhitespaceAndCapsAfterMasking() {
        assertThat(project(Role.REPEAT_ADD, "  ＡＤＤ\u00a0\t\n 항목  ", null).labels())
            .extracting(InteractionDecisionProvider.SemanticLabel::text).containsExactly("ADD 항목");
        String label = "qa@example.test " + "가".repeat(130);
        assertThat(project(Role.REPEAT_ADD, label, null).labels())
            .extracting(InteractionDecisionProvider.SemanticLabel::text)
            .containsExactly("<email> " + "가".repeat(112));
        assertThat(project(Role.REPEAT_ADD, " \t\n ", null).labels()).isEmpty();
        assertThat(project(Role.REPEAT_ADD, "qa@example.test", null).labels())
            .extracting(InteractionDecisionProvider.SemanticLabel::text).containsExactly("<email>");
    }

    @Test
    void preservesSourceRequiredTargetKindAndAliases() {
        Candidate candidate = new Candidate("original-candidate", Element.SELECT, Control.OPTION, Visibility.VISIBLE,
            true, true, true, RelationToTarget.SAME_REPEAT_ROW,
            new SemanticContext(List.of(new SemanticLabel(SemanticSource.SECTION_HEADING, "학력사항*")), true));
        var projection = new InteractionObservationProjector().project(new InteractionDecisionRequest(2, "snapshot",
            new InteractionDecisionRequest.Site("example.test", "/application"),
            List.of(new Decision("original-decision", Role.ROW_KIND_OPTION, "education.university.schoolName",
                List.of(candidate), TargetKind.BACHELOR))));
        var decision = projection.batch().decisions().getFirst();
        var projected = decision.candidates().getFirst();
        assertThat(decision.decisionId()).isEqualTo("d1");
        assertThat(decision.targetKind()).isEqualTo(TargetKind.BACHELOR);
        assertThat(projected.candidateId()).isEqualTo("c1_1");
        assertThat(projected.labels()).containsExactly(
            new InteractionDecisionProvider.SemanticLabel("section-heading", "학력사항*"));
        assertThat(projected.required()).isTrue();
        assertThat(projected.disabled()).isTrue();
        assertThat(projected.readonly()).isTrue();
        assertThat(projected.inert()).isTrue();
        assertThat(projected.relationToTarget()).isEqualTo(RelationToTarget.SAME_REPEAT_ROW);
        assertThat(projection.restore(new InteractionDecisionProvider.Resolution(2, List.of(
            new InteractionDecisionProvider.Selected("d1", Role.ROW_KIND_OPTION, "c1_1")))).results())
            .containsExactly(new InteractionDecisionProvider.Selected("original-decision", Role.ROW_KIND_OPTION,
                "original-candidate"));
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, mode = EnumSource.Mode.MATCH_ANY, names = {"SEARCH_RESULT_.*", "CALENDAR_.*"})
    void keepsResultAndCalendarRolesLabelFree(Role role) {
        assertThat(project(role, "원문 검색 결과 123 qa@example.test", null).labels()).isEmpty();
    }

    private static InteractionDecisionProvider.Candidate project(Role role, String label, TargetKind kind) {
        boolean option = role == Role.ROW_KIND_OPTION;
        Candidate candidate = new Candidate("candidate", option ? Element.SELECT : Element.BUTTON,
            option ? Control.OPTION : Control.BUTTON, Visibility.VISIBLE, null, null, null,
            option ? RelationToTarget.SAME_REPEAT_ROW : RelationToTarget.SAME_FIELD_GROUP,
            new SemanticContext(List.of(new SemanticLabel(SemanticSource.LABEL, label)), null));
        var request = new InteractionDecisionRequest(2, "projector-snapshot",
            new InteractionDecisionRequest.Site("example.test", "/application"),
            List.of(new Decision("decision", role, "education.university.schoolName", List.of(candidate), kind)));
        return new InteractionObservationProjector().project(request).batch().decisions().getFirst()
            .candidates().getFirst();
    }
}
