package com.careerform.formanalysis.infrastructure.adapter;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Converts arbitrary page text to a finite provider-safe semantic vocabulary. */
public final class ProviderSemanticSanitizer {

    private static final int MAX_TERMS = 6;
    private static final List<String> PASSTHROUGH_TERMS = List.of(
        "국문", "한글", "영문", "한자", "성명", "이름", "성", "성별", "생년월일",
        "연락처", "이메일", "휴대전화", "전화번호", "주소", "우편번호", "기본주소",
        "상세주소", "학력", "고등학교", "대학교", "대학원", "학교명", "전공",
        "부전공", "복수전공", "학위", "졸업", "재학", "휴학", "수료", "중퇴",
        "입학", "편입", "졸업예정", "입학일", "졸업일", "기간", "시작일", "종료일",
        "취득일", "발급일", "응시일", "학점", "만점", "성적", "점수", "등급",
        "주간", "야간", "국가", "도시", "소재지", "경력", "회사명", "기관명",
        "부서", "직위", "직책", "담당업무", "재직", "퇴사", "프로젝트",
        "프로젝트명", "역할", "상세내용", "설명", "수상", "수상명", "수여기관",
        "교육", "교육명", "교육기관", "교육시간", "자격증", "자격증명", "자격번호",
        "발급기관", "어학", "외국어", "언어", "시험명", "영어", "일본어", "중국어",
        "독일어", "프랑스어", "병역", "군필", "미필", "면제", "군별", "계급",
        "복무", "보훈", "장애", "건강", "대상", "비대상", "해당없음", "해당",
        "없음", "있음", "예", "아니오", "남성", "여성", "추가", "열기", "선택",
        "직접입력", "필수", "선택사항", "검색", "동의", "인증", "약관",
        "name", "full name", "first name", "last name", "given name", "family name",
        "korean", "english", "email", "phone", "mobile", "address", "postal code",
        "birth date", "date of birth", "gender", "education", "high school",
        "university", "graduate school", "school", "major", "degree", "gpa", "score",
        "grade", "start date", "end date", "graduation", "certificate",
        "certification", "issuer", "language", "test", "experience", "company",
        "department", "position", "project", "award", "training", "country", "city",
        "military", "veteran", "disability", "add", "open", "select", "required",
        "optional", "yes", "no", "male", "female", "yyyy-mm-dd", "yyyy-mm",
        "yyyymmdd", "yyyymm", "toeic", "toefl", "opic", "jlpt", "hsk"
    );
    private static final List<Term> TERMS = List.of(
        term("봉사 및 교내외 활동", "unsupported volunteer activity"),
        term("봉사·교내외 활동", "unsupported volunteer activity"),
        term("봉사활동", "unsupported volunteer activity"),
        term("봉사 활동", "unsupported volunteer activity"),
        term("자원봉사", "unsupported volunteer activity"),
        term("봉사", "unsupported volunteer activity"),
        term("volunteer experience", "unsupported volunteer activity"),
        term("volunteer activity", "unsupported volunteer activity"),
        term("volunteering", "unsupported volunteer activity"),
        term("교내외활동", "unsupported extracurricular activity"),
        term("교내외 활동", "unsupported extracurricular activity"),
        term("교내 활동", "unsupported extracurricular activity"),
        term("교외 활동", "unsupported extracurricular activity"),
        term("대외활동", "unsupported extracurricular activity"),
        term("대외 활동", "unsupported extracurricular activity"),
        term("동아리 활동", "unsupported extracurricular activity"),
        term("extracurricular activity", "unsupported extracurricular activity"),
        term("campus activity", "unsupported extracurricular activity"),
        term("공모전 및 수상", "unsupported award history"),
        term("공모전/수상", "unsupported award history"),
        term("수상경력", "unsupported award history"),
        term("수상 내역", "unsupported award history"),
        term("수상내역", "unsupported award history"),
        term("공모전", "unsupported award history"),
        term("수상", "unsupported award history"),
        term("award history", "unsupported award history"),
        term("awards", "unsupported award history"),
        term("해외경험", "unsupported overseas experience"),
        term("해외 경험", "unsupported overseas experience"),
        term("해외활동", "unsupported overseas experience"),
        term("해외 활동", "unsupported overseas experience"),
        term("overseas experience", "unsupported overseas experience"),
        term("international experience", "unsupported overseas experience"),
        term("나머지 주소", "address line 2"),
        term("나머지주소", "address line 2"),
        term("상세 주소", "address line 2"),
        term("상세주소", "address line 2"),
        term("address line 2", "address line 2"),
        term("address line2", "address line 2"),
        term("remaining address", "address line 2"),
        term("detailed address", "address line 2"),
        term("address details", "address line 2"),
        term("기본 주소", "address line 1"),
        term("기본주소", "address line 1"),
        term("도로명 주소", "address line 1"),
        term("도로명주소", "address line 1"),
        term("지번 주소", "address line 1"),
        term("지번주소", "address line 1"),
        term("address line 1", "address line 1"),
        term("address line1", "address line 1"),
        term("street address", "address line 1"),
        term("base address", "address line 1"),
        term("additional major classification", "additional major classification"),
        term("additional major field", "additional major field"),
        term("additional major name", "additional major name"),
        term("disability registration number", "disability registration number"),
        term("disability registration date", "disability registration date"),
        term("emergency phone number", "emergency phone number"),
        term("english family name", "English family name"),
        term("english given name", "English given name"),
        term("graduate school", "graduate school"),
        term("high school", "high school"),
        term("korean family name", "Korean family name"),
        term("korean given name", "Korean given name"),
        term("military service start", "military service start date"),
        term("military service end", "military service end date"),
        term("보훈 대상자와의 관계", "veteran relation"),
        term("장애등록번호", "disability registration number"),
        term("장애 등록일", "disability registration date"),
        term("면제·비대상 사유", "military exemption reason"),
        term("추가 전공 구분", "additional major classification"),
        term("추가 전공 계열", "additional major field"),
        term("추가 전공명", "additional major name"),
        term("영문 성", "English family name"),
        term("영문 이름", "English given name"),
        term("국문 성", "Korean family name"),
        term("국문 이름", "Korean given name"),
        term("한자 성", "Hanja family name"),
        term("한자 이름", "Hanja given name"),
        term("우편번호", "postal code"),
        term("비상연락처", "emergency phone number"),
        term("보조 이메일", "secondary email"),
        term("이메일주소", "email"),
        term("생년월일", "birth date"),
        term("학교 소재지", "school region"),
        term("학위구분", "degree level"),
        term("졸업구분", "completion status"),
        term("재학 상태", "completion status"),
        term("입학구분", "admission type"),
        term("학업과정", "academic process"),
        term("최종학력", "latest education type"),
        term("기준평점", "GPA scale"),
        term("만점기준", "GPA scale"),
        term("총 이수학점", "total credits"),
        term("복수전공유무", "double major status"),
        term("부전공유무", "minor status"),
        term("편입유무", "transfer status"),
        term("주전공 구분", "major classification"),
        term("주전공 계열", "major field"),
        term("주전공명", "major name"),
        term("복수전공명", "additional major name"),
        term("부전공명", "minor name"),
        term("논문요약", "thesis summary"),
        term("논문명", "thesis title"),
        term("담당교수", "lab professor name"),
        term("공인외국어시험", "language test"),
        term("외국어활용능력", "language skill"),
        term("등록번호", "registration number"),
        term("취득일", "acquisition date"),
        term("회화수준", "conversational level"),
        term("자격증명", "certificate name"),
        term("발급기관", "certificate issuer"),
        term("고용형태", "employment type"),
        term("재직 여부", "employment status"),
        term("담당업무", "responsibilities"),
        term("종료사유", "termination reason"),
        term("프로젝트 활동 시작일", "project start date"),
        term("프로젝트 활동 종료일", "project end date"),
        term("프로젝트 활동 상세내역", "project details"),
        term("프로젝트 시작일", "project start date"),
        term("프로젝트 종료일", "project end date"),
        term("프로젝트 상세내역", "project details"),
        term("활동 시작일", "activity start date"),
        term("활동 종료일", "activity end date"),
        term("활동 상세내역", "activity details"),
        term("활동 내역", "activity details"),
        term("활동내역", "activity details"),
        term("프로젝트 이름", "project name"),
        term("담당 역할", "project role"),
        term("희망직위", "desired position"),
        term("희망연봉", "desired salary"),
        term("직전연봉", "previous salary"),
        term("병역 상태", "military status"),
        term("병역구분", "military type"),
        term("복무 시작일", "military service start date"),
        term("복무 종료일", "military service end date"),
        term("전역구분", "military discharge type"),
        term("보훈 대상 여부", "veteran status"),
        term("보훈구분", "veteran type"),
        term("보훈번호", "veteran number"),
        term("장애 여부", "disability status"),
        term("장애 유형", "disability type"),
        term("장애 정도", "disability grade"),
        term("건강정보 항목", "health item name"),
        term("상태·값", "health status or value"),
        term("진단·확인일", "health date"),
        term("상세내용", "details"),
        term("family name", "family name"),
        term("given name", "given name"),
        term("full name", "full name"),
        term("postal code", "postal code"),
        term("phone number", "phone number"),
        term("birth date", "birth date"),
        term("school name", "school name"),
        term("start date", "start date"),
        term("end date", "end date"),
        term("completion status", "completion status"),
        term("degree level", "degree level"),
        term("major name", "major name"),
        term("registration number", "registration number"),
        term("acquisition date", "acquisition date"),
        term("company name", "company name"),
        term("department", "department"),
        term("position", "position"),
        term("email", "email"),
        term("연락처", "phone number"),
        term("성별", "gender"),
        term("국적", "nationality"),
        term("거주 국가", "residence country"),
        term("고등학교", "high school"),
        term("대학교", "university"),
        term("대학원", "graduate school"),
        term("학교명", "school name"),
        term("입학일", "education start date"),
        term("졸업일", "education end date"),
        term("평점", "GPA score"),
        term("외국어", "language"),
        term("시험명", "test name"),
        term("등급·점수", "test grade or score"),
        term("등급", "grade"),
        term("직장명", "company name"),
        term("입사일", "employment start date"),
        term("퇴사일", "employment end date"),
        term("근무부서", "department"),
        term("최종직위", "position"),
        term("병역", "military"),
        term("군별", "military branch"),
        term("병과", "military specialty"),
        term("계급", "military rank"),
        term("보훈", "veteran"),
        term("장애", "disability"),
        term("건강", "health"),
        term("프로젝트", "project"),
        term("자격증", "certificate"),
        term("학력", "education"),
        term("필수", "required"),
        term("선택", "optional"),
        term("추가", "add repeatable item"),
        term("펼치기", "reveal section"),
        term("있음", "yes"),
        term("없음", "no"),
        term("비해당", "no"),
        term("해당", "yes"),
        term("남성", "male"),
        term("여성", "female"),
        term("졸업예정", "expected graduation"),
        term("졸업", "graduated"),
        term("재학중", "enrolled"),
        term("중퇴", "withdrawn"),
        term("휴학", "leave of absence"),
        term("수료", "completed coursework")
    );

    private ProviderSemanticSanitizer() {
    }

    public static String sanitize(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String normalized = Normalizer.normalize(raw, Normalizer.Form.NFKC)
            .toLowerCase(Locale.ROOT)
            .replaceAll("\\s+", " ")
            .trim();
        String remaining = normalized;
        Set<String> canonical = new LinkedHashSet<>();
        for (Term term : TERMS) {
            int index = remaining.indexOf(term.match());
            if (index >= 0) {
                canonical.add(term.canonical());
                remaining = mask(remaining, index, term.match().length());
                if (canonical.size() == MAX_TERMS) {
                    break;
                }
            }
        }
        for (String term : PASSTHROUGH_TERMS) {
            int index = termIndex(remaining, term);
            if (index >= 0) {
                canonical.add(term);
                remaining = mask(remaining, index, term.length());
                if (canonical.size() == MAX_TERMS) {
                    break;
                }
            }
        }
        return canonical.isEmpty() ? null : String.join("; ", canonical);
    }

    private static int termIndex(String text, String term) {
        int index = text.indexOf(term);
        if (index < 0) {
            return -1;
        }
        if (!term.chars().allMatch(character -> character < 128)) {
            return index;
        }
        int before = index - 1;
        int after = index + term.length();
        return (before < 0 || !isAsciiLetter(text.charAt(before)))
            && (after >= text.length() || !isAsciiLetter(text.charAt(after)))
                ? index
                : -1;
    }

    private static String mask(String text, int index, int length) {
        return text.substring(0, index)
            + " ".repeat(length)
            + text.substring(index + length);
    }

    private static boolean isAsciiLetter(char character) {
        return character >= 'a' && character <= 'z';
    }

    public static List<SafeLabel> sanitizeFields(
        List<com.careerform.formanalysis.dto.FieldsAnalysisRequest.SemanticLabel> labels
    ) {
        if (labels == null) {
            return null;
        }
        List<SafeLabel> safe = new ArrayList<>();
        for (var label : labels) {
            String text = sanitize(label.text());
            if (text != null) {
                safe.add(new SafeLabel(source(label.source().name()), text));
            }
        }
        return safe.isEmpty() ? null : List.copyOf(safe);
    }

    public static List<SafeLabel> sanitizeActions(
        List<com.careerform.formanalysis.dto.PreparationAnalysisRequest.SemanticLabel> labels
    ) {
        if (labels == null) {
            return null;
        }
        List<SafeLabel> safe = new ArrayList<>();
        for (var label : labels) {
            String text = sanitize(label.text());
            if (text != null) {
                safe.add(new SafeLabel(source(label.source().name()), text));
            }
        }
        return safe.isEmpty() ? null : List.copyOf(safe);
    }

    private static String source(String enumName) {
        return enumName.toLowerCase(Locale.ROOT).replace('_', '-');
    }

    private static Term term(String match, String canonical) {
        return new Term(match.toLowerCase(Locale.ROOT), canonical);
    }

    public record SafeLabel(String source, String text) {
    }

    private record Term(String match, String canonical) {
    }
}
