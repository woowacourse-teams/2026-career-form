package com.careerform.profileimport;

import java.text.Normalizer;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import tools.jackson.databind.JsonNode;

/**
 * 프로필 모델(frontend/src/profile/model.ts, field-definitions.ts)의 범주, 섹션, 필드, 입력 형식을 그대로 옮긴 초안 스키마다.
 * 모델 응답에서 이 목록에 없는 키는 버리고, 형식이 틀리거나 원문에서 찾을 수 없는 값은 버린다.
 * 최종학력(topLevelFields)은 항목 밖에 저장되고 증빙 서류 위치는 사용자 기기 경로라 이력서에서 가져오지 않는다.
 */
final class ProfileDraftSchema {
    static final int MAX_ENTRIES = 20;
    private static final int MAX_TEXT = 200;
    private static final int MAX_TEXTAREA = 4000;
    private static final Pattern DATE = Pattern.compile("(\\d{4})-(\\d{2})-(\\d{2})");
    private static final Pattern EMAIL = Pattern.compile("[^\\s@]{1,64}@[^\\s@]{1,190}\\.[^\\s@]{2,63}");
    private static final Pattern TEL = Pattern.compile("\\d{9,11}");
    private static final Pattern TEL_SEPARATORS = Pattern.compile("[\\s().-]");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    enum Kind { TEXT, TEXTAREA, DATE, EMAIL, TEL, SELECT }

    record Field(String id, Kind kind, Map<String, String> options) {}

    record Category(String id, boolean repeated, Map<String, Map<String, Field>> sections) {}

    /** profile은 응답 본문, counts는 범주별 추출 건수(단일 범주는 값 수, 반복 범주는 항목 수)다. */
    record Draft(Map<String, Object> profile, Map<String, Integer> counts, int droppedKeys, int droppedValues) {
        @Override public String toString() { return "Draft[redacted]"; }
    }

    private static final Map<String, String> GENDER = plain("남성", "여성", "논바이너리");
    private static final Map<String, String> EDUCATION_STATUS = plain("재학중", "졸업예정", "졸업", "중퇴", "휴학", "수료");
    private static final Map<String, String> MAJOR_FIELD = plain("인문계열", "사회계열", "교육계열", "공학계열",
        "자연과학계열", "의약학계열", "예체능계열", "농수해양/생명자원계열", "기타");
    private static final Map<String, String> PRESENCE = plain("없음", "있음");
    private static final Map<String, String> ATTENDANCE = labeled("attendance:day", "주간", "attendance:night", "야간");
    private static final Map<String, String> SCHOOL_REGION = labeled(
        "region:seoul", "서울", "region:busan", "부산", "region:daegu", "대구", "region:incheon", "인천",
        "region:gwangju", "광주", "region:daejeon", "대전", "region:ulsan", "울산", "region:sejong", "세종",
        "region:gyeonggi", "경기", "region:gangwon", "강원", "region:chungbuk", "충북", "region:chungnam", "충남",
        "region:jeonbuk", "전북", "region:jeonnam", "전남", "region:gyeongbuk", "경북", "region:gyeongnam", "경남",
        "region:jeju", "제주", "region:overseas", "해외");
    private static final Map<String, String> MILITARY_STATUS = labeled(
        "military-status:served", "군필", "military-status:serving", "복무중", "military-status:not-served", "미필",
        "military-status:exempt", "면제", "military-status:not-applicable", "비대상");
    private static final Map<String, String> MILITARY_BRANCH = labeled(
        "military-branch:army", "육군", "military-branch:navy", "해군", "military-branch:air-force", "공군",
        "military-branch:marine-corps", "해병대", "military-branch:combat-police", "전투경찰",
        "military-branch:coast-guard", "해양경찰", "military-branch:conscripted-police", "의무경찰",
        "military-branch:conscripted-firefighter", "의무소방");
    private static final Map<String, String> MILITARY_RANK = labeled(
        "military-rank:byeongjang", "병장", "military-rank:sangbyeong", "상병", "military-rank:ilbyeong", "일병",
        "military-rank:ibyeong", "이병");
    private static final Map<String, String> VETERAN_STATUS = labeled(
        "veteran-status:eligible", "대상", "veteran-status:not-eligible", "비대상");
    private static final Map<String, String> VETERAN_RELATION = labeled(
        "veteran-relation:self", "본인", "veteran-relation:spouse", "배우자", "veteran-relation:son", "아들",
        "veteran-relation:daughter", "딸", "veteran-relation:father", "부", "veteran-relation:mother", "모",
        "veteran-relation:grandfather", "조부", "veteran-relation:grandmother", "조모",
        "veteran-relation:sibling", "형제·자매", "veteran-relation:other", "기타");
    private static final Map<String, String> DISABILITY_STATUS = labeled(
        "disability-status:eligible", "대상", "disability-status:not-eligible", "비대상");
    private static final Map<String, String> DISABILITY_GRADE = labeled(
        "disability-grade:severe", "중증", "disability-grade:mild", "경증");

    private static final List<Category> CATEGORIES = List.of(
        single("personal",
            text("koreanFamilyName"), text("koreanGivenName"), text("hanjaFamilyName"), text("hanjaGivenName"),
            text("englishFamilyName"), text("englishGivenName"), select("gender", GENDER), date("birthDate"),
            text("nationality")),
        single("contact",
            field("email", Kind.EMAIL), field("secondaryEmail", Kind.EMAIL), field("phoneNumber", Kind.TEL),
            field("emergencyPhoneNumber", Kind.TEL), text("residenceCountry"), text("postalCode"),
            text("addressLine1"), text("addressLine2")),
        repeated("education",
            section("highSchool",
                select("academicProcess", plain("고등학교", "대입 검정고시")), date("qualificationPassDate"),
                text("schoolName"), select("attendanceType", ATTENDANCE), select("completionStatus", EDUCATION_STATUS),
                select("schoolRegion", SCHOOL_REGION), date("startDate"), date("endDate")),
            section("university",
                select("schoolType", plain("전문대학", "대학교")), select("degreeLevel", plain("전문학사", "학사")),
                text("schoolName"), select("attendanceType", ATTENDANCE), date("startDate"), date("endDate"),
                select("completionStatus", EDUCATION_STATUS), select("schoolRegion", SCHOOL_REGION), text("gpaScore"),
                select("gpaScale", plain("4.00", "4.30", "4.50", "100.00")), text("totalCredits"),
                select("majorField", MAJOR_FIELD), text("majorName"), select("transferStatus", plain("비해당", "해당")),
                select("doubleMajorStatus", PRESENCE), select("minorStatus", PRESENCE),
                select("additionalMajorField", MAJOR_FIELD), text("additionalMajorName"),
                select("minorField", MAJOR_FIELD), text("minorName")),
            section("graduateSchool",
                select("degreeLevel", plain("석사", "박사", "석박사통합")), select("combinedDegreeStatus", plain("예", "아니오")),
                text("country"), text("schoolName"), select("attendanceType", ATTENDANCE),
                select("schoolRegion", SCHOOL_REGION), date("startDate"), date("endDate"), text("admissionType"),
                text("completionStatus"), text("gpaScore"), text("gpaScale"), select("majorField", MAJOR_FIELD),
                text("majorName"), select("doubleMajorStatus", PRESENCE), select("minorStatus", PRESENCE),
                select("additionalMajorField", MAJOR_FIELD), text("additionalMajorName"),
                select("minorField", MAJOR_FIELD), text("minorName"), text("researchField"), text("labName"),
                text("labProfessorName"), text("thesisTitle"), textarea("thesisSummary"))),
        repeated("languages",
            section("languageTest",
                text("language"), text("testName"), text("registrationNo"), date("acquisitionDate"), text("grade")),
            section("languageSkill", text("language"), text("conversationalLevel"))),
        repeated("certifications",
            section("certificate",
                text("name"), text("grade"), text("registrationNo"), text("issuer"), date("acquisitionDate"))),
        repeated("careers",
            section("career",
                text("companyName"), select("employmentType", plain("정규", "계약", "인턴", "파견", "프리랜서",
                    "아르바이트", "개인사업", "병역특례", "기타")), date("startDate"), date("endDate"),
                select("employmentStatus", plain("재직중", "퇴직")), text("department"), text("position"),
                textarea("responsibilities"), text("terminationReason"))),
        repeated("projects",
            section("project",
                date("startDate"), date("endDate"), text("projectName"), text("organization"), text("role"),
                textarea("activityDetails"))),
        repeated("publications",
            section("publicationPatent", select("type", plain("논문", "특허")), text("title"), textarea("details"))),
        single("compensation", text("desiredPosition"), text("desiredSalary"), text("previousSalary")),
        single("military",
            select("militaryStatus", MILITARY_STATUS), select("militaryType", plain("현역병", "상근예비역",
                "공익근무요원", "전문연구요원", "산업기능요원")), select("militaryBranch", MILITARY_BRANCH),
            text("militarySpecialty"), select("militaryRank", MILITARY_RANK), date("serviceStartDate"),
            date("serviceEndDate"), text("dischargeType"), text("exemptionReason")),
        single("veteran",
            select("veteranStatus", VETERAN_STATUS), text("veteranType"), select("veteranRelation", VETERAN_RELATION),
            text("veteranNumber")),
        single("disability",
            select("disabilityStatus", DISABILITY_STATUS), text("disabilityType"),
            select("disabilityGrade", DISABILITY_GRADE), text("disabilityRegistrationNumber"),
            date("disabilityRegistrationDate")),
        repeated("health",
            section("health", text("healthItemName"), text("healthStatusOrValue"), date("healthDate"),
                textarea("healthDetails")))
    );

    static List<String> categoryIds() {
        return CATEGORIES.stream().map(Category::id).toList();
    }

    boolean isDraftShape(JsonNode output) {
        return output != null && output.isObject();
    }

    Draft validate(JsonNode output, String source) {
        var ground = new Ground(source);
        var counter = new int[2];
        Map<String, JsonNode> byCategory = new LinkedHashMap<>();
        for (var property : output.properties()) {
            if (CATEGORIES.stream().anyMatch(category -> category.id().equals(property.getKey()))) {
                byCategory.put(property.getKey(), property.getValue());
            } else {
                counter[0]++;
            }
        }
        Map<String, Object> profile = new LinkedHashMap<>();
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (var category : CATEGORIES) {
            var node = byCategory.get(category.id());
            if (category.repeated()) {
                var entries = entries(category, node, ground, counter);
                profile.put(category.id(), entries);
                counts.put(category.id(), entries.size());
            } else {
                var values = values(category.sections().get(category.id()), node, ground, counter);
                profile.put(category.id(), values);
                counts.put(category.id(), values.size());
            }
        }
        return new Draft(Collections.unmodifiableMap(profile), Collections.unmodifiableMap(counts),
            counter[0], counter[1]);
    }

    private static List<Object> entries(Category category, JsonNode node, Ground ground, int[] counter) {
        if (node == null || node.isNull()) return List.of();
        if (!node.isArray()) {
            counter[1]++;
            return List.of();
        }
        List<Object> entries = new ArrayList<>();
        for (var entry : node) {
            if (!entry.isObject()) {
                counter[1]++;
                continue;
            }
            for (var property : entry.properties()) {
                if (!property.getKey().equals("sectionId") && !property.getKey().equals("values")) counter[0]++;
            }
            var sectionId = entry.path("sectionId");
            var section = sectionId.isString() ? category.sections().get(sectionId.asString()) : null;
            if (section == null) {
                counter[0]++;
                continue;
            }
            var values = values(section, entry.get("values"), ground, counter);
            if (values.isEmpty()) continue;
            if (entries.size() == MAX_ENTRIES) {
                counter[1]++;
                continue;
            }
            entries.add(Map.of("sectionId", sectionId.asString(), "values", values));
        }
        return List.copyOf(entries);
    }

    private static Map<String, String> values(Map<String, Field> fields, JsonNode node, Ground ground, int[] counter) {
        if (node == null || node.isNull()) return Map.of();
        if (!node.isObject()) {
            counter[1]++;
            return Map.of();
        }
        Map<String, String> values = new LinkedHashMap<>();
        for (var property : node.properties()) {
            var field = fields.get(property.getKey());
            if (field == null) {
                counter[0]++;
                continue;
            }
            var value = property.getValue().isString() ? accepted(field, property.getValue().asString(), ground) : null;
            if (value == null) {
                if (!property.getValue().isNull()) counter[1]++;
                continue;
            }
            values.put(field.id(), value);
        }
        return Collections.unmodifiableMap(values);
    }

    /** 받아들일 값을 돌려주고, 형식이 틀리거나 원문에서 찾을 수 없으면 null이다. */
    private static String accepted(Field field, String raw, Ground ground) {
        var value = raw.strip();
        if (value.isEmpty()) return null;
        return switch (field.kind()) {
            case SELECT -> field.options().containsKey(value) ? value : null;
            case DATE -> validDate(value) && ground.hasYear(value.substring(0, 4)) ? value : null;
            case TEL -> {
                var digits = TEL_SEPARATORS.matcher(value).replaceAll("");
                yield TEL.matcher(digits).matches() && ground.hasPhone(digits) ? digits : null;
            }
            case EMAIL -> EMAIL.matcher(value).matches() && ground.hasText(value) ? value : null;
            case TEXT -> value.length() <= MAX_TEXT && ground.hasText(value) ? value : null;
            case TEXTAREA -> value.length() <= MAX_TEXTAREA && ground.hasText(value) ? value : null;
        };
    }

    private static boolean validDate(String value) {
        var matcher = DATE.matcher(value);
        if (!matcher.matches()) return false;
        try {
            LocalDate.of(Integer.parseInt(matcher.group(1)), Integer.parseInt(matcher.group(2)),
                Integer.parseInt(matcher.group(3)));
            return true;
        } catch (DateTimeException exception) {
            return false;
        }
    }

    /** 모델에 알려 줄 키 목록. 키는 `범주.섹션.필드`, 단일 범주는 섹션과 범주가 같다. */
    String promptCatalog() {
        var lines = new ArrayList<String>();
        for (var category : CATEGORIES) {
            for (var section : category.sections().entrySet()) {
                for (var field : section.getValue().values()) {
                    var line = category.id() + "." + section.getKey() + "." + field.id() + " : " + describe(field);
                    lines.add(line);
                }
            }
        }
        return String.join("\n", lines);
    }

    String promptShape() {
        var single = new ArrayList<String>();
        var repeated = new ArrayList<String>();
        for (var category : CATEGORIES) {
            if (category.repeated()) {
                repeated.add(category.id() + " (sectionId: " + String.join(", ", category.sections().keySet()) + ")");
            } else {
                single.add(category.id());
            }
        }
        return "Single-record categories (JSON object of field values): " + String.join(", ", single)
            + "\nRepeated categories (JSON array of {\"sectionId\": ..., \"values\": {...}}, one element per record): "
            + String.join("; ", repeated);
    }

    private static String describe(Field field) {
        return switch (field.kind()) {
            case TEXT -> "text";
            case TEXTAREA -> "long text";
            case DATE -> "date YYYY-MM-DD (omit unless year, month and day are all written)";
            case EMAIL -> "email address";
            case TEL -> "phone number";
            case SELECT -> "one of " + String.join(", ", field.options().entrySet().stream()
                .map(option -> option.getKey().equals(option.getValue())
                    ? option.getKey() : option.getKey() + " (" + option.getValue() + ")")
                .toList());
        };
    }

    /**
     * 원문 대조. 공백, 대소문자, 전각 차이는 같은 글자로 본다. 전화번호는 원문에서 구분자를 뺀 글자에서 찾고,
     * 날짜는 연도가 원문에 네 자리 숫자로 따로 있어야 한다(일과 월 표기는 원문마다 달라 형식으로만 검증한다).
     */
    private static final class Ground {
        private final String normalized;
        private final String compact;
        private final String phones;

        private Ground(String source) {
            normalized = Normalizer.normalize(source, Normalizer.Form.NFKC);
            compact = compact(source);
            phones = TEL_SEPARATORS.matcher(normalized).replaceAll("");
        }

        boolean hasText(String value) {
            var needle = compact(value);
            return !needle.isEmpty() && compact.contains(needle);
        }

        boolean hasPhone(String digits) {
            return phones.contains(digits);
        }

        boolean hasYear(String year) {
            return Pattern.compile("(?<!\\d)" + year + "(?!\\d)").matcher(normalized).find();
        }

        private static String compact(String value) {
            return WHITESPACE.matcher(Normalizer.normalize(value, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT))
                .replaceAll("");
        }
    }

    private static Category single(String id, Field... fields) {
        return new Category(id, false, Map.of(id, fields(fields)));
    }

    @SafeVarargs
    private static Category repeated(String id, Map.Entry<String, Map<String, Field>>... sections) {
        Map<String, Map<String, Field>> byId = new LinkedHashMap<>();
        for (var section : sections) byId.put(section.getKey(), section.getValue());
        return new Category(id, true, Collections.unmodifiableMap(byId));
    }

    private static Map.Entry<String, Map<String, Field>> section(String id, Field... fields) {
        return Map.entry(id, fields(fields));
    }

    private static Map<String, Field> fields(Field... fields) {
        Map<String, Field> byId = new LinkedHashMap<>();
        for (var field : fields) byId.put(field.id(), field);
        return Collections.unmodifiableMap(byId);
    }

    private static Field field(String id, Kind kind) {
        return new Field(id, kind, Map.of());
    }

    private static Field text(String id) {
        return field(id, Kind.TEXT);
    }

    private static Field textarea(String id) {
        return field(id, Kind.TEXTAREA);
    }

    private static Field date(String id) {
        return field(id, Kind.DATE);
    }

    private static Field select(String id, Map<String, String> options) {
        return new Field(id, Kind.SELECT, options);
    }

    private static Map<String, String> plain(String... values) {
        Map<String, String> options = new LinkedHashMap<>();
        for (var value : values) options.put(value, value);
        return Collections.unmodifiableMap(options);
    }

    private static Map<String, String> labeled(String... pairs) {
        Map<String, String> options = new LinkedHashMap<>();
        for (int index = 0; index < pairs.length; index += 2) options.put(pairs[index], pairs[index + 1]);
        return Collections.unmodifiableMap(options);
    }
}
