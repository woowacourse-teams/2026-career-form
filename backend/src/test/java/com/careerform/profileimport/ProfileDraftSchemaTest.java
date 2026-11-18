package com.careerform.profileimport;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

@DisplayName("이력서 초안 응답 스키마 검증")
class ProfileDraftSchemaTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String SOURCE = """
        합성 이력서
        이름 홍합성 / 연락처 010-0000-1469 / synthetic.469@example.test
        합성대학교 컴퓨터공학과 2015-03-02 입학 2019-02-20 졸업
        합성대학원 2019-03-04 입학
        합성상사 백엔드 개발 2019-03-04 ~ 2021-06-30
        합성전자 플랫폼팀 2021-07-01 ~ 재직
        정보처리기사 2018-11-16 취득, 합성자격 1급
        TOEIC 900, OPIc IH
        """;

    private final ProfileDraftSchema schema = new ProfileDraftSchema();

    private ProfileDraftSchema.Draft validate(String json) {
        return schema.validate(JSON.readTree(json), SOURCE);
    }

    @Test
    @DisplayName("모든 범주를 프로필 모델 모양으로 돌려주고 비어 있는 범주는 빈 값으로 둔다")
    void returnsEveryCategoryInProfileShape() {
        var draft = validate("{}");

        assertThat(draft.profile()).containsOnlyKeys("personal", "contact", "education", "languages",
            "certifications", "careers", "projects", "publications", "compensation", "military", "veteran",
            "disability", "health");
        assertThat(draft.profile().get("personal")).isEqualTo(Map.of());
        assertThat(draft.profile().get("education")).isEqualTo(List.of());
        assertThat(draft.droppedKeys()).isZero();
        assertThat(draft.droppedValues()).isZero();
    }

    @Test
    @DisplayName("묶음 항목은 섹션별로 여러 건을 구분해 남기고 범주별 건수를 센다")
    void keepsRepeatedEntriesSeparately() {
        var draft = validate("""
            {"education":[
              {"sectionId":"university","values":{"schoolName":"합성대학교","startDate":"2015-03-02","endDate":"2019-02-20"}},
              {"sectionId":"graduateSchool","values":{"schoolName":"합성대학원","startDate":"2019-03-04"}}],
             "careers":[
              {"sectionId":"career","values":{"companyName":"합성상사","employmentStatus":"퇴직"}},
              {"sectionId":"career","values":{"companyName":"합성전자","department":"플랫폼팀","employmentStatus":"재직중"}}],
             "certifications":[
              {"sectionId":"certificate","values":{"name":"정보처리기사","acquisitionDate":"2018-11-16"}},
              {"sectionId":"certificate","values":{"name":"합성자격","grade":"1급"}}],
             "languages":[
              {"sectionId":"languageTest","values":{"testName":"TOEIC","grade":"900"}},
              {"sectionId":"languageTest","values":{"testName":"OPIc","grade":"IH"}}]}
            """);

        assertThat(draft.profile().get("education")).isEqualTo(List.of(
            Map.of("sectionId", "university", "values",
                Map.of("schoolName", "합성대학교", "startDate", "2015-03-02", "endDate", "2019-02-20")),
            Map.of("sectionId", "graduateSchool", "values",
                Map.of("schoolName", "합성대학원", "startDate", "2019-03-04"))));
        assertThat((List<?>) draft.profile().get("careers")).hasSize(2);
        assertThat((List<?>) draft.profile().get("certifications")).hasSize(2);
        assertThat((List<?>) draft.profile().get("languages")).hasSize(2);
        assertThat(draft.counts()).containsEntry("education", 2).containsEntry("careers", 2)
            .containsEntry("certifications", 2).containsEntry("languages", 2).containsEntry("personal", 0);
    }

    @Test
    @DisplayName("프로필 모델에 없는 범주, 섹션, 필드, 항목 키는 버리고 버린 키 수를 센다")
    void dropsKeysOutsideTheProfileModel() {
        var draft = validate("""
            {"hobbies":{"name":"합성"},
             "personal":{"koreanFamilyName":"홍","bloodType":"A"},
             "education":[{"sectionId":"kindergarten","values":{"schoolName":"합성대학교"}},
                          {"sectionId":"university","id":"x","values":{"schoolName":"합성대학교","clubName":"합성"}}],
             "certifications":[{"sectionId":"certificate","values":{"name":"정보처리기사","evidenceDocumentPath":"C:/x"}}]}
            """);

        assertThat(draft.profile()).doesNotContainKey("hobbies");
        assertThat(draft.profile().get("personal")).isEqualTo(Map.of("koreanFamilyName", "홍"));
        assertThat(draft.profile().get("education")).isEqualTo(List.of(
            Map.of("sectionId", "university", "values", Map.of("schoolName", "합성대학교"))));
        assertThat(draft.profile().get("certifications")).isEqualTo(List.of(
            Map.of("sectionId", "certificate", "values", Map.of("name", "정보처리기사"))));
        // hobbies, bloodType, kindergarten, id, clubName, evidenceDocumentPath
        assertThat(draft.droppedKeys()).isEqualTo(6);
    }

    @Test
    @DisplayName("형식이 틀린 날짜, 이메일, 전화번호, 선택값, 문자열이 아닌 값은 버리고 버린 값 수를 센다")
    void dropsValuesWithWrongFormat() {
        var draft = validate("""
            {"personal":{"birthDate":"1995.03","gender":"남자","koreanFamilyName":7},
             "contact":{"email":"synthetic.469-at-example","phoneNumber":"010-0000-1469"},
             "careers":[{"sectionId":"career","values":{"companyName":"합성상사","startDate":"2019-02-30",
                         "employmentType":"정규직"}}],
             "education":[{"sectionId":"university","values":{"schoolName":"합성대학교","schoolRegion":"region:seoul",
                           "attendanceType":"주간"}}]}
            """);

        assertThat(draft.profile().get("personal")).isEqualTo(Map.of());
        assertThat(draft.profile().get("contact")).isEqualTo(Map.of("phoneNumber", "01000001469"));
        assertThat(draft.profile().get("careers")).isEqualTo(List.of(
            Map.of("sectionId", "career", "values", Map.of("companyName", "합성상사"))));
        assertThat(draft.profile().get("education")).isEqualTo(List.of(
            Map.of("sectionId", "university", "values", Map.of("schoolName", "합성대학교", "schoolRegion", "region:seoul"))));
        // birthDate, gender, koreanFamilyName, email, startDate, employmentType, attendanceType
        assertThat(draft.droppedValues()).isEqualTo(7);
    }

    @Test
    @DisplayName("원문에 없는 글자 값과 연도는 만들어 넣지 않고 버린다")
    void dropsValuesThatAreNotInTheSourceText() {
        var draft = validate("""
            {"personal":{"koreanFamilyName":"홍","koreanGivenName":"없는이름"},
             "contact":{"email":"invented@example.test","phoneNumber":"01099998888"},
             "careers":[{"sectionId":"career","values":{"companyName":"만든회사","startDate":"2001-01-01"}}],
             "projects":[{"sectionId":"project","values":{"projectName":"합성 프로젝트 아님"}}]}
            """);

        assertThat(draft.profile().get("personal")).isEqualTo(Map.of("koreanFamilyName", "홍"));
        assertThat(draft.profile().get("contact")).isEqualTo(Map.of());
        assertThat(draft.profile().get("careers")).isEqualTo(List.of());
        assertThat(draft.profile().get("projects")).isEqualTo(List.of());
        assertThat(draft.counts()).containsEntry("careers", 0).containsEntry("projects", 0);
        assertThat(draft.droppedValues()).isEqualTo(6);
    }

    @Test
    @DisplayName("공백과 대소문자 차이는 원문 근거로 인정하고 빈 값은 버린다")
    void toleratesWhitespaceButDropsBlankValues() {
        var draft = validate("""
            {"contact":{"email":"SYNTHETIC.469@example.test","addressLine1":"  "},
             "careers":[{"sectionId":"career","values":{"companyName":"합성 상사"}}]}
            """);

        assertThat(draft.profile().get("contact")).isEqualTo(Map.of("email", "SYNTHETIC.469@example.test"));
        assertThat((List<?>) draft.profile().get("careers")).hasSize(1);
        assertThat(draft.droppedValues()).isEqualTo(1);
    }

    @Test
    @DisplayName("응답 최상위가 객체가 아니면 쓸 수 없는 응답으로 본다")
    void rejectsNonObjectOutput() {
        assertThat(schema.isDraftShape(JSON.readTree("[]"))).isFalse();
        assertThat(schema.isDraftShape(JSON.readTree("\"text\""))).isFalse();
        assertThat(schema.isDraftShape(JSON.readTree("{}"))).isTrue();
    }

    private static final String DATED = """
        합성상사 2020.03 ~ 2021년 6월
        합성전자 03/2022 입사, 2023-01-15 퇴사
        합성학교 2018 졸업, 경력 3년, 사번 2019-0731
        """;

    private ProfileDraftSchema.Draft validateDated(String json) {
        return schema.validate(JSON.readTree(json), DATED);
    }

    @Test
    @DisplayName("원문에 연월만 있으면 YYYY-MM을 받는다(점, 년월, 월/연 표기)")
    void keepsMonthOnlyDates() {
        var draft = validateDated("""
            {"careers":[
              {"sectionId":"career","values":{"companyName":"합성상사","startDate":"2020-03","endDate":"2021-06"}},
              {"sectionId":"career","values":{"companyName":"합성전자","startDate":"2022-03"}}]}
            """);

        assertThat(draft.profile().get("careers")).isEqualTo(List.of(
            Map.of("sectionId", "career", "values",
                Map.of("companyName", "합성상사", "startDate", "2020-03", "endDate", "2021-06")),
            Map.of("sectionId", "career", "values", Map.of("companyName", "합성전자", "startDate", "2022-03"))));
        assertThat(draft.droppedValues()).isZero();
    }

    @Test
    @DisplayName("원문에 연월일이 있으면 YYYY-MM-DD를 그대로 받는다")
    void keepsFullDates() {
        var draft = validateDated("""
            {"careers":[{"sectionId":"career","values":{"companyName":"합성전자","endDate":"2023-01-15"}}]}
            """);

        assertThat(draft.profile().get("careers")).isEqualTo(List.of(
            Map.of("sectionId", "career", "values", Map.of("companyName", "합성전자", "endDate", "2023-01-15"))));
        assertThat(draft.droppedValues()).isZero();
    }

    @Test
    @DisplayName("원문에 연도만 있으면 날짜를 비우고 일이나 월을 지어낸 값은 버린다")
    void dropsYearOnlyDates() {
        var draft = validateDated("""
            {"education":[{"sectionId":"university","values":{"schoolName":"합성학교","endDate":"2018"}},
                          {"sectionId":"highSchool","values":{"schoolName":"합성학교","endDate":"2018-01"}},
                          {"sectionId":"graduateSchool","values":{"schoolName":"합성학교","endDate":"2018-01-01"}}]}
            """);

        assertThat(draft.profile().get("education")).isEqualTo(List.of(
            Map.of("sectionId", "university", "values", Map.of("schoolName", "합성학교")),
            Map.of("sectionId", "highSchool", "values", Map.of("schoolName", "합성학교")),
            Map.of("sectionId", "graduateSchool", "values", Map.of("schoolName", "합성학교"))));
        assertThat(draft.droppedValues()).isEqualTo(3);
    }

    @Test
    @DisplayName("연도는 있지만 그 연도의 월이 원문에 없으면 버리고 관계없는 숫자는 월 근거로 보지 않는다")
    void dropsUngroundedMonths() {
        var draft = validateDated("""
            {"careers":[{"sectionId":"career","values":{"companyName":"합성상사","startDate":"2020-05-01",
                         "endDate":"2019-07-31"}}],
             "projects":[{"sectionId":"project","values":{"projectName":"합성상사","startDate":"2021-03",
                          "endDate":"2018-03-01"}}]}
            """);

        assertThat(draft.profile().get("careers")).isEqualTo(List.of(
            Map.of("sectionId", "career", "values", Map.of("companyName", "합성상사"))));
        assertThat(draft.profile().get("projects")).isEqualTo(List.of(
            Map.of("sectionId", "project", "values", Map.of("projectName", "합성상사"))));
        // 2020-05-01(원문은 2020.03), 2019-07-31(사번 2019-0731의 일부), 2021-03(원문은 2021년 6월), 2018-03-01(2018 다음은 졸업)
        assertThat(draft.droppedValues()).isEqualTo(4);
    }

    @Test
    @DisplayName("월이 01~12가 아니거나 두 자리가 아니면 버린다")
    void dropsInvalidMonths() {
        var draft = validateDated("""
            {"careers":[{"sectionId":"career","values":{"companyName":"합성상사","startDate":"2020-03",
                         "endDate":"2020-13"}},
                        {"sectionId":"career","values":{"companyName":"합성상사","startDate":"2020-00",
                         "endDate":"2020-3"}},
                        {"sectionId":"career","values":{"companyName":"합성상사","startDate":"2020.03"}}]}
            """);

        assertThat(draft.profile().get("careers")).isEqualTo(List.of(
            Map.of("sectionId", "career", "values", Map.of("companyName", "합성상사", "startDate", "2020-03")),
            Map.of("sectionId", "career", "values", Map.of("companyName", "합성상사")),
            Map.of("sectionId", "career", "values", Map.of("companyName", "합성상사"))));
        assertThat(draft.droppedValues()).isEqualTo(4);
    }

    @Test
    @DisplayName("프롬프트 목록은 프로필 모델의 범주, 섹션, 필드 키와 선택값을 담는다")
    void promptCatalogListsModelKeys() {
        var catalog = schema.promptCatalog();

        assertThat(catalog).contains("education.university.schoolName", "careers.career.companyName",
            "languages.languageTest.testName", "certifications.certificate.registrationNo",
            "region:seoul", "attendance:day", "재직중");
        assertThat(catalog).doesNotContain("evidenceDocumentPath", "latestEducationType");
        assertThat(catalog).contains("date YYYY-MM-DD or YYYY-MM");
    }
}
