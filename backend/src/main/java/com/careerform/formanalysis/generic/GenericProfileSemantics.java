package com.careerform.formanalysis.generic;

import java.text.Normalizer;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import com.careerform.formanalysis.infrastructure.adapter.ProviderSemanticSanitizer;

/**
 * 범용 경력·자격·어학 섹션 안에서만 쓰는 의미 근거.
 * 공유 정제기의 유한 어휘가 놓치는 구조 라벨을 이 패키지 안의 유한 어휘로 보완하고,
 * 기존 지원 키에 값 없이 읽을 수 있는 의미 설명을 붙인다. 회사·호스트·DOM 식별자는 보지 않는다.
 */
final class GenericProfileSemantics {

    private static final Set<String> VOCABULARY_CATEGORIES = Set.of("CAREER", "CERTIFICATE", "LANGUAGE");
    private static final int MAX_TERMS = 6;

    private record Term(String canonical, List<String> compactMatches) {
    }

    /** 공백·구분 기호를 뺀 라벨에서 찾는다. 긴 표현이 먼저 오도록 나열한다. */
    private static final List<Term> TERMS = List.of(
        new Term("job duties", List.of("업무내용", "담당업무", "주요업무", "수행업무", "직무내용", "담당직무",
            "jobduties", "responsibilities")),
        new Term("certificate or license type", List.of("자격면허종류", "자격종류", "면허종류", "자격면허",
            "자격명", "면허명", "licensetype")),
        new Term("issuing organization", List.of("수여기관", "주관기관", "시행기관", "발행기관", "발급처",
            "issuingorganization", "issuingbody")),
        new Term("exam", List.of("시험", "exam")),
        new Term("grade or level", List.of("급수", "레벨", "level"))
    );

    private static final String PLAIN = "Applicant profile field ";

    /** 값 없이 읽을 수 있는 의미 설명. 목록에 없는 키는 기존 한 줄 설명을 그대로 쓴다. */
    private static final Map<String, String> MEANINGS = Map.of(
        "careers.career.responsibilities",
        ": the job duties or work content summary of one employment record (업무내용, 담당 업무). "
            + "Not the company name, department, position, or the details of a separate project.",
        "certifications.certificate.name",
        ": the type or name of a license or certificate held (자격/면허 종류, 자격증명). "
            + "Not its grade, registration number, or issuing organization.",
        "certifications.certificate.issuer",
        ": the organization that issued a certificate or license (발급기관, 수여 기관) in a certificate "
            + "or license record. An issuing organization of a language test is not this field.",
        "languages.languageTest.testName",
        ": the name of the language proficiency exam taken (시험, 시험명). "
            + "Not the language itself, its score, or its grade.",
        "languages.languageTest.grade",
        ": the grade or level label of a language test result, only for a grade or level field. "
            + "A free-text score or points field (점수, 성적) is not this field; choose ABSTAIN when only "
            + "a numeric score is asked."
    );

    private GenericProfileSemantics() {
    }

    static boolean extendsVocabulary(String category) {
        return category != null && VOCABULARY_CATEGORIES.contains(category);
    }

    static String describe(String key) {
        return PLAIN + key + MEANINGS.getOrDefault(key, "");
    }

    /** 공유 정제 결과에 확정된 범주 안의 구조 어휘를 더한다. extended가 아니면 정제 결과 그대로다. */
    static String project(String raw, boolean extended) {
        String safe = ProviderSemanticSanitizer.sanitize(raw);
        if (!extended || raw == null || raw.isBlank()) {
            return safe;
        }
        String compact = Normalizer.normalize(raw, Normalizer.Form.NFKC)
            .toLowerCase(Locale.ROOT)
            .replaceAll("[\\s/·・()\\[\\]_,.-]+", "");
        Set<String> terms = new LinkedHashSet<>();
        if (safe != null) {
            terms.addAll(List.of(safe.split("; ")));
        }
        for (Term term : TERMS) {
            for (String match : term.compactMatches()) {
                int index = compact.indexOf(match);
                if (index >= 0) {
                    terms.add(term.canonical());
                    compact = compact.substring(0, index) + compact.substring(index + match.length());
                    break;
                }
            }
        }
        return terms.isEmpty() ? null : String.join("; ", terms.stream().limit(MAX_TERMS).toList());
    }
}
