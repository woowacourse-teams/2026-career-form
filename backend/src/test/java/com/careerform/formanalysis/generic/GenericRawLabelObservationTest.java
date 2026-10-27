package com.careerform.formanalysis.generic;

import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.CATEGORIES;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.FIELDS;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answerAll;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormControl;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormElement;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Option;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Section;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticContext;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticLabel;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticSource;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Visibility;

/** 범용 필드 매핑은 사전 정제 대신 마스킹한 원문 라벨을 공급자에 보낸다(2026-10-26 사용자 결정). */
class GenericRawLabelObservationTest {

    @Test
    void sendsMaskedRawLabelsInsteadOfVocabularyTerms() {
        var http = new GenericFieldsJevHttp();
        http.respond(call -> answerAll(call, "ABSTAIN", 0.9));
        var resolver = new JevCategoryFieldResolver(GenericFieldsJevHttp.client(http), FIELDS, CATEGORIES,
            3, 5, 10, 8000);
        var school = new FieldCandidate("school", FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE, null,
            null, null, "학교명", null, null, null, null,
            new SemanticContext(List.of(new SemanticLabel(SemanticSource.SECTION_HEADING, "대학(4년제 이상)"),
                new SemanticLabel(SemanticSource.DESCRIPTION, "문의 qa@example.test 01012345678")),
                null, null, null, null, null, null, null), null);
        var kind = new FieldCandidate("kind", FormElement.SELECT, FormControl.SELECT, Visibility.VISIBLE, "학력구분",
            null, null, null, null, null, null,
            List.of(new Option("o1", "고등학교"), new Option("o2", "전문대학(2, 3년제)")),
            new SemanticContext(null, null, null, null, null, null, null, null), null);

        resolver.resolve(new GenericFieldsRequest(2, "raw-labels",
            new GenericFieldsRequest.Site("example.test", "/apply"),
            List.of(new Section("edu", null, "학력 사항", List.of(school, kind), null, "EDUCATION"))));

        String body = String.join("\n", http.bodies());
        assertThat(body).contains("대학(4년제 이상)", "전문대학(2, 3년제)", "학교명", "학력 사항");
        assertThat(body).doesNotContain("qa@example.test", "01012345678");
        assertThat(body).contains("<email>", "<number>");
    }
}
