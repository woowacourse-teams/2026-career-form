package com.careerform.formanalysis.generic;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.ChoiceModel;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Role;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.TargetKind;
import com.careerform.formanalysis.generic.SectionClassificationRequest.ControlKind;

@DisplayName("범용 매칭 로직은 공급자 중립 선택 모델 포트만 부른다")
class ChoiceModelPortTest {

    private static final SupportedProfileFields FIELDS = new SupportedProfileFields();
    private static final SectionCategories CATEGORIES = new SectionCategories(FIELDS);

    /** 질문을 기록하고 정해진 답을 돌려주는 공급자. */
    static final class FakeModel implements ChoiceModel {
        final List<Map<String, Question>> answered = new ArrayList<>();
        final List<Map<String, Question>> chosen = new ArrayList<>();
        private final java.util.function.Function<Question, String> pick;

        FakeModel(java.util.function.Function<Question, String> pick) {
            this.pick = pick;
        }

        @Override
        public String provider() {
            return "fake";
        }

        @Override
        public String model() {
            return "fake-1";
        }

        @Override
        public Map<String, Judgement> answer(Object state, Map<String, Question> questions) {
            answered.add(questions);
            Map<String, Judgement> result = new LinkedHashMap<>();
            questions.forEach((id, question) -> result.put(id, new Judgement(pick.apply(question), 0.9, Map.of())));
            return result;
        }

        @Override
        public Map<String, String> choose(Object state, Map<String, Question> questions) {
            chosen.add(questions);
            Map<String, String> result = new LinkedHashMap<>();
            questions.forEach((id, question) -> result.put(id, pick.apply(question)));
            return result;
        }
    }

    @Test
    @DisplayName("섹션 분류는 섹션마다 범주 선택지와 ABSTAIN이 있는 질문 하나를 보내고 답을 범주로 돌려준다")
    void classifiesSectionsThroughPort() {
        FakeModel model = new FakeModel(question -> "EDUCATION");
        var classifier = new ChoiceSectionClassifier(model, CATEGORIES);

        var result = classifier.classify(List.of(new SectionClassifier.SectionShape("s1", null, "학력",
            List.of("학교명"), List.of(ControlKind.TEXT), true)));

        assertThat(result.get("s1").category()).isEqualTo("EDUCATION");
        assertThat(result.get("s1").confidence()).isEqualTo(0.9);
        assertThat(model.answered).hasSize(1);
        assertThat(model.answered.getFirst().values()).allSatisfy(question ->
            assertThat(question.criteria()).containsKeys(ChoiceModel.ABSTAIN, "EDUCATION", "PERSONAL"));
    }

    @Test
    @DisplayName("필드 매핑은 같은 포트의 answer로 칸을 묻고 ABSTAIN은 매핑 없음으로 바꾼다")
    void mapsFieldsThroughPort() {
        FakeModel model = new FakeModel(question -> question.criteria().containsKey("personal.personal.birthDate")
            ? "personal.personal.birthDate" : ChoiceModel.ABSTAIN);
        var resolver = new ChoiceFieldResolver(model, FIELDS, CATEGORIES, 1, 5, 10, 8000);

        var resolution = resolver.resolve(GenericFieldsJevHttp.request("example.com", List.of(
            GenericFieldsJevHttp.section("s1", "PERSONAL", List.of(GenericFieldsJevHttp.field("c1", "생년월일"))))));

        assertThat(model.answered).isNotEmpty();
        assertThat(resolution.mappings().values()).extracting(ChoiceFieldResolver.Mapping::profileFieldKey)
            .containsOnly("personal.personal.birthDate");
        assertThat(resolution.modelCalls()).isEqualTo(model.answered.size());
    }

    @Test
    @DisplayName("버튼·선택지 결정은 같은 포트의 choose로 묻고 학력 단계 질문도 지원한다")
    void decidesInteractionsThroughPort() {
        FakeModel model = new FakeModel(question -> question.criteria().keySet().stream()
            .filter(key -> !ChoiceModel.ABSTAIN.equals(key)).findFirst().orElseThrow());
        var decisions = new ChoiceInteractionDecisions(model);

        var resolution = decisions.decide(new InteractionDecisionProvider.Batch(2, List.of(
            new InteractionDecisionProvider.Decision("rowKind0", Role.ROW_KIND_OPTION, null,
                List.of(new InteractionDecisionProvider.Candidate("rowKind0-option1",
                    com.careerform.formanalysis.dto.InteractionDecisionRequest.Element.SELECT,
                    com.careerform.formanalysis.dto.InteractionDecisionRequest.Control.OPTION,
                    com.careerform.formanalysis.dto.InteractionDecisionRequest.Visibility.VISIBLE, false, false, false,
                    com.careerform.formanalysis.dto.InteractionDecisionRequest.RelationToTarget.SAME_REPEAT_ROW,
                    List.of(new InteractionDecisionProvider.SemanticLabel("label", "고등학교")), false)),
                TargetKind.HIGH_SCHOOL))));

        assertThat(model.chosen).hasSize(1);
        assertThat(resolution.results()).singleElement()
            .isInstanceOfSatisfying(InteractionDecisionProvider.Selected.class,
                selected -> assertThat(selected.candidateId()).isEqualTo("rowKind0-option1"));
    }
}
