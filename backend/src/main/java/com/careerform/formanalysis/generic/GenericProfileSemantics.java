package com.careerform.formanalysis.generic;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormControl;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormElement;
import com.careerform.formanalysis.generic.GenericFieldsRequest.InputType;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticSource;
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
        new Term("test score", List.of("시험점수", "성적", "점수", "testscore")),
        new Term("grade or level", List.of("급수", "레벨", "level"))
    );

    private static final String PLAIN = "Applicant profile field ";

    /** 기존 등급·점수 계약을 공급자와 payload 검사에서 같은 구조로 읽는다. 실제 프로필 값은 담지 않는다. */
    private static final String LANGUAGE_RESULT_CRITERION = """
        {
          "profileFieldKey": "languages.languageTest.grade",
          "meaning": "The numeric score or grade/level of one language test result.",
          "acceptedTargetKinds": ["NUMERIC_SCORE", "GRADE"],
          "multipleTargetPolicy": "ABSTAIN_IF_UNRESOLVED",
          "abstainWhen": "Separate score and grade controls compete in the same record and structure alone \
        cannot identify the right target without a profile value. Do not force either target."
        }""";

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
            + "Not the language itself, its score, or its grade."
    );

    private GenericProfileSemantics() {
    }

    /** 정확히 두 선택지의 의미와 구조 라벨만 사용한다. DOM 식별자나 현재 값은 근거가 아니다. */
    static String choiceKey(String sectionHeading, FieldCandidate candidate) {
        if (candidate.options() == null || candidate.options().size() != 2
            || !(candidate.control() == FormControl.SELECT || candidate.control() == FormControl.RADIO
                || candidate.control() == FormControl.CUSTOM || candidate.control() == FormControl.BUTTON)
            || candidate.semanticContext() != null && Boolean.TRUE.equals(candidate.semanticContext().multiple())) {
            return null;
        }
        List<String> options = candidate.options().stream()
            .map(option -> compactChoiceText(option.displayName())).toList();
        if (options.contains("외국인")
            && options.stream().anyMatch(option -> Set.of("내국인", "국내한국국적").contains(option))) {
            return "personal.personal.nationality";
        }
        if (options.stream().noneMatch(option -> Set.of("대상", "해당", "예").contains(option))
            || options.stream().noneMatch(option -> Set.of("비대상", "비해당", "해당없음", "아니오").contains(option))) {
            return null;
        }
        // 섹션 제목만으로는 같은 섹션의 동의·증빙 같은 다른 예/아니오 질문과 구분되지 않는다.
        List<String> labels = new ArrayList<>();
        labels.add(compactChoiceText(candidate.displayName()));
        var context = candidate.semanticContext();
        if (context != null && context.labels() != null) {
            context.labels().stream()
                .filter(label -> label.source() == SemanticSource.LABEL
                    || label.source() == SemanticSource.ARIA_LABEL
                    || label.source() == SemanticSource.ARIA_LABELLEDBY)
                .forEach(label -> labels.add(compactChoiceText(label.text())));
        }
        // 묶음 legend·제목은 근거가 아니지만, 라벨과 다른 항목을 가리키면 충돌로 보고 기권한다.
        String heading = compactChoiceText(sectionHeading);
        if (labels.stream().anyMatch(label -> label.contains("장애")) && heading.contains("보훈")
            || labels.stream().anyMatch(label -> label.contains("보훈")) && heading.contains("장애")
            || labels.stream().anyMatch(label -> label.contains("장애"))
                && labels.stream().anyMatch(label -> label.contains("보훈"))) {
            return null;
        }
        if (labels.stream().anyMatch(label -> label.matches("장애(?:인)?(?:여부|대상여부)?"))) {
            return "disability.disability.disabilityStatus";
        }
        if (labels.stream().anyMatch(label -> label.matches("보훈(?:대상)?(?:여부)?"))) {
            return "veteran.veteran.veteranStatus";
        }
        return null;
    }

    /** 기본 정보의 텍스트 칸이 영문 성 또는 이름 하나만 명시할 때만 그 단일 이름 키를 고른다. */
    static String englishNameKey(String category, FieldCandidate candidate) {
        if (!"PERSONAL".equals(category) || candidate.element() != FormElement.INPUT
            || candidate.control() != FormControl.TEXT) {
            return null;
        }
        List<String> labels = new ArrayList<>();
        labels.add(candidate.displayName());
        var context = candidate.semanticContext();
        if (context != null && context.labels() != null) {
            context.labels().stream()
                .filter(label -> label.source() == SemanticSource.LABEL
                    || label.source() == SemanticSource.ARIA_LABEL
                    || label.source() == SemanticSource.ARIA_LABELLEDBY)
                .forEach(label -> labels.add(label.text()));
        }
        boolean family = false;
        boolean given = false;
        for (String label : labels) {
            String normalized = label == null ? "" : Normalizer.normalize(label, Normalizer.Form.NFKC)
                .toLowerCase(Locale.ROOT);
            // 국문 이름 칸이 영문 병기를 함께 쓰는 경우는 영문 이름 칸이 아니다.
            if (normalized.contains("한글") || normalized.contains("국문") || normalized.contains("한국어")) {
                return null;
            }
            String compact = normalized.replaceAll("[^a-z]", "");
            family |= compact.contains("lastname") || compact.contains("familyname")
                || compact.contains("surname");
            given |= compact.contains("firstname") || compact.contains("givenname");
        }
        if (family == given) {
            return null;
        }
        return family ? "personal.personal.englishFamilyName" : "personal.personal.englishGivenName";
    }

    /** 이행·미필·면제 세 상태를 모두 담은 병역 선택지는 유형이 섞여 있어도 병역 상태 칸이다. */
    static String militaryKey(String category, String sectionHeading, FieldCandidate candidate) {
        if (candidate.options() == null
            || !(candidate.control() == FormControl.SELECT || candidate.control() == FormControl.RADIO
                || candidate.control() == FormControl.CUSTOM || candidate.control() == FormControl.BUTTON)
            || candidate.semanticContext() != null && Boolean.TRUE.equals(candidate.semanticContext().multiple())) {
            return null;
        }
        List<String> options = candidate.options().stream()
            .map(option -> compactChoiceText(option.displayName()).replace("_", "")).toList();
        boolean context = ("SENSITIVE".equals(category) || category == null)
            && (compactChoiceText(sectionHeading).contains("병역")
                || compactChoiceText(candidate.displayName()).contains("병역")
                || options.stream().anyMatch(option -> option.contains("병역")));
        boolean served = options.stream().anyMatch(option -> option.startsWith("병역필") || option.startsWith("군필"));
        boolean notServed = options.stream().anyMatch(option -> option.contains("미필"));
        boolean exempt = options.stream().anyMatch(option -> option.contains("면제"));
        return context && served && notServed && exempt ? "military.military.militaryStatus" : null;
    }

    private static String compactChoiceText(String text) {
        return text == null ? "" : Normalizer.normalize(text, Normalizer.Form.NFKC)
            .replaceAll("[\\s()]+", "");
    }

    /** 저장된 자격증은 취득한 항목이므로 취득·응시 공용 날짜도 자격 취득일에 연결한다. */
    static String certificateDateKey(String category, FieldCandidate candidate) {
        var context = candidate.semanticContext();
        if (!"CERTIFICATE".equals(category) || candidate.element() != FormElement.INPUT
            || candidate.control() != FormControl.TEXT || context == null
            || !(context.inputType() == InputType.DATE
                || context.inputType() == InputType.TEXT && Integer.valueOf(10).equals(context.maxLength()))) {
            return null;
        }
        List<String> labels = new ArrayList<>();
        labels.add(candidate.displayName());
        labels.add(candidate.placeholder());
        if (context.labels() != null) {
            context.labels().stream()
                .filter(label -> label.source() == SemanticSource.LABEL
                    || label.source() == SemanticSource.ARIA_LABEL
                    || label.source() == SemanticSource.ARIA_LABELLEDBY
                    || label.source() == SemanticSource.PLACEHOLDER)
                .forEach(label -> labels.add(label.text()));
        }
        boolean acquiredDate = labels.stream().filter(java.util.Objects::nonNull)
            .map(label -> Normalizer.normalize(label, Normalizer.Form.NFKC).replaceAll("[\\s/·]+", ""))
            .anyMatch(label -> label.matches(".*취득(?:일자?|응시일).*"));
        return acquiredDate ? "certifications.certificate.acquisitionDate" : null;
    }

    private static final java.util.regex.Pattern CERTIFICATE_NUMBER =
        java.util.regex.Pattern.compile("(?:자격증?|인증|등록|발급|면허)+번호");

    /**
     * 자격증 기록 안에서 라벨이 자격·인증·등록·발급·면허와 '번호'로만 된 입력칸은 등록번호다.
     * 모델이 기권했거나 다른 자격증 항목(이름·등급·기관 등)을 준 경우에만 바로잡고, 자격증 밖의 키는 덮어쓰지 않는다.
     */
    static String certificateNumberKey(String category, FieldCandidate candidate, String currentKey) {
        if (!"CERTIFICATE".equals(category) || candidate.element() != GenericFieldsRequest.FormElement.INPUT
            || candidate.control() != GenericFieldsRequest.FormControl.TEXT || candidate.displayName() == null
            || currentKey != null && !currentKey.startsWith("certifications.certificate.")) {
            return null;
        }
        String compact = Normalizer.normalize(candidate.displayName(), Normalizer.Form.NFKC).replaceAll("\\s+", "");
        return CERTIFICATE_NUMBER.matcher(compact).matches() ? "certifications.certificate.registrationNo" : null;
    }

    static boolean extendsVocabulary(String category) {
        return category != null && VOCABULARY_CATEGORIES.contains(category);
    }

    static String describe(String key) {
        if ("languages.languageTest.grade".equals(key)) {
            return LANGUAGE_RESULT_CRITERION;
        }
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
