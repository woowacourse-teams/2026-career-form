package com.careerform.formanalysis.generic;

import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.CATEGORIES;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.FIELDS;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answerAll;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.field;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.request;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

import com.careerform.formanalysis.generic.GenericFieldsRequest.Section;
import com.careerform.formanalysis.infrastructure.adapter.jev.JevClient;

@DisplayName("범용 학력 섹션의 기록 종류 힌트와 학력·병역 키 의미")
class GenericEducationRecordHintTest {

    private Set<String> criteriaFor(Section section) {
        var http = new GenericFieldsJevHttp();
        http.respond(call -> answerAll(call, null, 0.9));
        new JevCategoryFieldResolver(GenericFieldsJevHttp.client(http), FIELDS, CATEGORIES, 3, 5, 10, 8000)
            .resolve(request("example.test", List.of(section)));
        var call = http.calls().getFirst();
        return new HashSet<>(call.criteria(call.questionIds().getFirst()));
    }

    private static Section education(String recordSectionId, String category) {
        return new Section("edu", null, "학력", List.of(field("c-school", "학교명"), field("c-scale", "만점")),
            null, category, recordSectionId);
    }

    @Test
    @DisplayName("기록 힌트가 있는 확정 학력 섹션은 그 기록의 키와 ABSTAIN만 후보로 보낸다")
    void narrowsEducationKeysToHintedRecord() {
        Set<String> criteria = criteriaFor(education("university", "EDUCATION"));

        assertThat(criteria).contains(JevClient.ABSTAIN, "education.university.schoolName",
            "education.university.gpaScale", "education.university.totalCredits");
        assertThat(criteria).allSatisfy(key -> assertThat(key.equals(JevClient.ABSTAIN)
            || key.startsWith("education.university.")
            || key.startsWith("DATE_PART:education.university.")).as(key).isTrue());
    }

    @Test
    @DisplayName("힌트가 없거나 어떤 키와도 맞지 않으면 학력 세 기록의 키를 그대로 보낸다")
    void keepsAllEducationRecordsWithoutUsableHint() {
        for (String hint : new String[] {null, "unknownRecord"}) {
            Set<String> criteria = criteriaFor(education(hint, "EDUCATION"));

            assertThat(criteria).as(String.valueOf(hint)).contains("education.highSchool.schoolName",
                "education.university.schoolName", "education.graduateSchool.schoolName");
        }
    }

    @Test
    @DisplayName("범주가 확정되지 않은 섹션에는 기록 힌트를 적용하지 않는다")
    void ignoresHintForUnconfirmedCategory() {
        Set<String> criteria = criteriaFor(education("university", SectionCategories.MIXED));

        assertThat(criteria).contains("education.highSchool.schoolName", "careers.career.companyName");
    }

    @Test
    @DisplayName("요청 JSON의 recordSectionId를 알 수 없는 속성 거부 설정에서도 읽는다")
    void readsRecordSectionIdFromJson() {
        var mapper = JsonMapper.builder().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();

        Section section = mapper.readValue("""
            {"sectionId":"gs1","fields":[],"category":"EDUCATION","recordSectionId":"university"}
            """, Section.class);

        assertThat(section.recordSectionId()).isEqualTo("university");
    }

    @Test
    @DisplayName("평점·만점·이수학점과 병역 상태·유형 키는 키 이름 외의 서로 다른 의미 설명을 가진다")
    void describesGradeAndMilitaryMeanings() {
        List<String> keys = List.of(
            "education.university.gpaScore", "education.university.gpaScale",
            "education.graduateSchool.gpaScore", "education.graduateSchool.gpaScale",
            "education.university.totalCredits",
            "military.military.militaryStatus", "military.military.militaryType");
        Set<String> descriptions = new HashSet<>();
        for (String key : keys) {
            String description = GenericProfileSemantics.describe(key);
            assertThat(description).as(key).startsWith("Applicant profile field " + key)
                .isNotEqualTo("Applicant profile field " + key);
            descriptions.add(description.substring(("Applicant profile field " + key).length()));
        }
        // 같은 의미의 대학·대학원 평점 설명은 공유하고, 다섯 의미는 서로 구별된다.
        assertThat(descriptions).hasSize(5);
    }
}
