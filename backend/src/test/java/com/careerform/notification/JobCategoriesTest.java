package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.stream.IntStream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("직무 분류 정본")
class JobCategoriesTest {
    @Test
    @DisplayName("실제 분류 파일은 버전 1에 대분류 7개이고 모든 소분류 코드는 자기 대분류 접두를 가진다")
    void loadsBundledCategories() {
        var categories = JobCategories.load();
        assertThat(categories.version()).isEqualTo(1);
        assertThat(categories.categories()).hasSize(7);
        assertThat(categories.containsRole("IT.BACKEND")).isTrue();
        assertThat(categories.containsRole("IT")).isFalse();
        assertThat(categories.containsRole("it.backend")).isFalse();
        assertThat(categories.containsRole(null)).isFalse();
        assertThat(categories.roleLabel("IT.BACKEND")).contains("백엔드");
        assertThat(categories.roleLabel("IT.UNKNOWN")).isEmpty();
        assertThat(categories.roleCount()).isEqualTo(categories.categories().stream().mapToInt(category -> category.roles().size()).sum()).isGreaterThan(7).isLessThanOrEqualTo(JobCategories.MAX_ROLES);
        assertThat(categories.categories()).allSatisfy(category -> assertThat(category.roles()).isNotEmpty()
            .allSatisfy(role -> assertThat(role.code()).startsWith(category.code() + ".")));
    }

    @Test
    @DisplayName("중복 코드, 형식이 틀린 코드, 빈 소분류, 잘못된 라벨, 버전 0, 깨진 JSON은 기동을 막는 예외다")
    void rejectsInvalidDefinitions() {
        assertInvalid(json(1, category("IT", "IT/개발", role("IT.BACKEND", "백엔드"), role("IT.BACKEND", "백엔드 2"))), "중복 소분류 코드");
        assertInvalid(json(1, category("IT", "IT/개발", role("IT.BACKEND", "백엔드")), category("IT", "개발", role("IT.FRONTEND", "프론트엔드"))), "중복 대분류 코드");
        assertInvalid(json(1, category("it", "IT/개발", role("it.BACKEND", "백엔드"))), "소문자 대분류 코드");
        assertInvalid(json(1, category("IT", "IT/개발", role("IT.backend", "백엔드"))), "소문자 소분류 코드");
        assertInvalid(json(1, category("IT", "IT/개발", role("IT.BACK END", "백엔드"))), "공백이 든 소분류 코드");
        assertInvalid(json(1, category("IT DEV", "IT/개발", role("IT DEV.BACKEND", "백엔드"))), "공백이 든 대분류 코드");
        assertInvalid(json(1, category("IT", "IT/개발", role("DESIGN.UX_UI", "UX/UI"))), "접두가 다른 소분류 코드");
        assertInvalid(json(1, category("IT", "IT/개발", role("BACKEND", "백엔드"))), "접두가 없는 소분류 코드");
        assertInvalid(json(1, category("IT", "IT/개발", role("IT.", "백엔드"))), "소분류가 빈 코드");
        assertInvalid(json(1, category("IT", "IT/개발")), "빈 소분류 배열");
        assertInvalid(json(1), "빈 대분류 배열");
        assertInvalid(json(1, category("IT", "", role("IT.BACKEND", "백엔드"))), "빈 대분류 라벨");
        assertInvalid(json(1, category("IT", "IT/개발", role("IT.BACKEND", ""))), "빈 소분류 라벨");
        assertInvalid(json(1, category("IT", "IT/개발", role("IT.BACKEND", "   "))), "공백뿐인 라벨");
        assertInvalid(json(1, category("IT", "IT/개발", role("IT.BACKEND", "라".repeat(41)))), "41자 라벨");
        assertInvalid(json(1, category("IT", "IT/개발", role("IT.BACKEND", "백\\n엔드"))), "제어 문자 라벨");
        assertInvalid(json(0, category("IT", "IT/개발", role("IT.BACKEND", "백엔드"))), "version 0");
        assertInvalid("{\"categories\":[" + category("IT", "IT/개발", role("IT.BACKEND", "백엔드")) + "]}", "version 없음");
        assertInvalid("{\"version\":\"1\",\"categories\":[" + category("IT", "IT/개발", role("IT.BACKEND", "백엔드")) + "]}", "문자열 version");
        assertInvalid("{\"version\":", "잘못된 JSON");
        assertInvalid("[]", "객체가 아닌 JSON");
        assertInvalid("{\"version\":1,\"categories\":[\"IT\"]}", "객체가 아닌 대분류");
        var boundary = JobCategories.parse(json(1, category("IT", "IT/개발", role("IT.BACKEND", "라".repeat(40))), category("A_1", "경계", role("A_1.B_2", "소분류"))));
        assertThat(boundary.roleLabel("IT.BACKEND")).contains("라".repeat(40));
        assertThat(boundary.roleLabel("A_1.B_2")).contains("소분류");
        assertThat(boundary.roleCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("소분류 총수는 공고가 전체를 고를 수 있는 상한 30개까지만 허용하고, 분류 전체를 고른 라벨은 '전체 직무'다")
    void capsTotalRolesAndLabelsFullSelection() {
        assertThat(JobCategories.MAX_ROLES).isEqualTo(30);
        var full = JobCategories.parse(json(1, category("ALL", "전체", syntheticRoles("ALL", JobCategories.MAX_ROLES))));
        assertThat(full.roleCount()).isEqualTo(JobCategories.MAX_ROLES);
        var codes = full.categories().getFirst().roles().stream().map(JobCategories.Role::code).toList();
        assertThat(full.label(codes, 120)).isEqualTo(JobCategories.ALL_ROLES_LABEL).isEqualTo("전체 직무");
        assertThat(full.label(codes.reversed(), 120)).isEqualTo("전체 직무");
        assertThat(full.label(codes.subList(0, codes.size() - 1), 120)).isNotEqualTo("전체 직무").hasSizeLessThanOrEqualTo(120).endsWith("개");
        assertThat(full.label(List.of("ALL.R0"), 120)).isEqualTo("직무 0");
        assertInvalid(json(1, category("ALL", "전체", syntheticRoles("ALL", JobCategories.MAX_ROLES + 1))), "소분류 31개");
        assertInvalid(json(1, category("A", "가", syntheticRoles("A", JobCategories.MAX_ROLES)), category("B", "나", syntheticRoles("B", 1))), "두 대분류 합계 31개");
    }

    private static void assertInvalid(String json, String description) {
        assertThatThrownBy(() -> JobCategories.parse(json)).as(description).isInstanceOf(IllegalStateException.class);
    }

    static String json(int version, String... categories) {
        return "{\"version\":" + version + ",\"categories\":[" + String.join(",", categories) + "]}";
    }

    static String category(String code, String label, String... roles) {
        return "{\"code\":\"" + code + "\",\"label\":\"" + label + "\",\"roles\":[" + String.join(",", roles) + "]}";
    }

    static String role(String code, String label) { return "{\"code\":\"" + code + "\",\"label\":\"" + label + "\"}"; }

    /** `<대분류>.R<번호>` 코드와 `직무 <번호>` 라벨인 합성 소분류 count개. */
    static String[] syntheticRoles(String category, int count) {
        return IntStream.range(0, count).mapToObj(index -> role(category + ".R" + index, "직무 " + index)).toArray(String[]::new);
    }
}
