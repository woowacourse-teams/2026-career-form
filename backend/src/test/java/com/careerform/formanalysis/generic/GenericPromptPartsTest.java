package com.careerform.formanalysis.generic;

import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.CATEGORIES;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.FIELDS;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.field;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.request;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.section;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.careerform.formanalysis.application.PromptSource;
import com.careerform.formanalysis.generic.GenericFieldsJevHttp.Call;
import com.careerform.formanalysis.generic.SectionClassifier.SectionShape;
import com.careerform.formanalysis.generic.SectionClassificationRequest.ControlKind;
import tools.jackson.databind.JsonNode;

@DisplayName("범용 매칭 프롬프트 조각이 실제 모델 요청 문구를 모두 담는다")
class GenericPromptPartsTest {

    @Test
    @DisplayName("필드 매핑 요청의 지시문, 선택지 설명, 혼동 기준은 모두 프롬프트 조각에 있다")
    void fieldMappingPromptIsCovered() {
        var http = new GenericFieldsJevHttp();
        var resolver = new ChoiceFieldResolver(GenericFieldsJevHttp.client(http), FIELDS, CATEGORIES, 3, 5, 10, 8000);
        resolver.resolve(GenericFieldsJevHttp.fixture("naver-career-sections.request.json"));
        resolver.resolve(GenericFieldsJevHttp.fixture("independent-synthetic-sections.request.json"));
        resolver.resolve(GenericFieldsJevHttp.fixture("naver-career.synthetic-adversarial.request.json"));
        resolver.resolve(request("synthetic.example", List.of(
            section("s1", "PERSONAL", List.of(field("f1", "영문 성"), field("f2", "영문 이름"), field("f3", "생년월일"))),
            section("s2", null, List.of(field("f4", "기타"))))));

        Collection<String> parts = resolver.promptParts().values();
        String guidance = resolver.promptParts().get("confusionBoundaries");
        String nameGuidance = resolver.promptParts().get("englishNameGuidance");

        assertThat(http.calls()).isNotEmpty();
        for (Call call : http.calls()) {
            assertCovered(call, parts);
            String boundaries = call.state().path("confusionBoundaries").asString();
            assertThat(boundaries).isIn(guidance, guidance + "\n" + nameGuidance);
        }
        assertThat(http.calls()).anySatisfy(call ->
            assertThat(call.state().path("confusionBoundaries").asString()).contains(nameGuidance));
    }

    @Test
    @DisplayName("섹션 분류 요청의 지시문과 범주 설명은 모두 프롬프트 조각에 있다")
    void sectionClassificationPromptIsCovered() {
        var http = new GenericFieldsJevHttp();
        var classifier = new ChoiceSectionClassifier(GenericFieldsJevHttp.client(http), CATEGORIES);
        classifier.classify(List.of(
            new SectionShape("a", null, "학력", List.of("학교명"), List.of(ControlKind.TEXT), false),
            new SectionShape("b", "a", null, List.of("회사명"), List.of(ControlKind.TEXT), true)));

        assertThat(http.calls()).hasSize(1);
        assertCovered(http.calls().getFirst(), classifier.promptParts().values());
    }

    @Test
    @DisplayName("프롬프트 출처 이름은 서로 다르다")
    void sourceIdsAreDistinct() {
        PromptSource fields = new ChoiceFieldResolver(GenericFieldsJevHttp.client(new GenericFieldsJevHttp()),
            FIELDS, CATEGORIES, 3, 5, 10, 8000);
        PromptSource sections = new ChoiceSectionClassifier(GenericFieldsJevHttp.client(new GenericFieldsJevHttp()), CATEGORIES);

        assertThat(Set.of(fields.promptSourceId(), sections.promptSourceId())).hasSize(2);
    }

    private static void assertCovered(Call call, Collection<String> parts) {
        List<String> missing = new ArrayList<>();
        for (String id : call.questionIds()) {
            JsonNode question = call.request().path("questions").path(id);
            String instructions = question.path("instructions").asString()
                .replace(id, PromptSource.QUESTION_ID_PLACEHOLDER);
            if (!parts.contains(instructions)) {
                missing.add("instructions:" + instructions);
            }
            question.path("criteria").properties().forEach(entry -> {
                if (!parts.contains(entry.getValue().asString())) {
                    missing.add("criterion:" + entry.getKey());
                }
            });
        }
        assertThat(missing).isEmpty();
    }
}
