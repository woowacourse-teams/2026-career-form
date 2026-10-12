package com.careerform.formanalysis.infrastructure.adapter;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

@DisplayName("공급자 양식 텍스트 원문 투영")
class ProviderFormTextTest {

    @Test
    @DisplayName("사전에 없는 공통 라벨과 기존 오변환 사례를 원문으로 보존한다")
    void preservesLabelsOutsideDictionary() {
        assertThat(ProviderFormText.project("희망근무지")).isEqualTo("희망근무지");
        assertThat(ProviderFormText.project("학교 선택")).isEqualTo("학교 선택");
        assertThat(ProviderFormText.project("해당없음")).isEqualTo("해당없음");
        assertThat(ProviderFormText.project("내용을 작성해 주세요"))
            .isEqualTo("내용을 작성해 주세요");
    }

    @Test
    @DisplayName("NFKC 정규화 후 제어·서식 문자를 지우고 공백을 축약한다")
    void normalizesAndRemovesInvisibleCharacters() {
        assertThat(ProviderFormText.project("  ＡＢＣ\t학교\u200B명\u202E\n 입력\u3000 "))
            .isEqualTo("ABC 학교명 입력");
        assertThat(ProviderFormText.project(" \u200B\t ")).isNull();
        assertThat(ProviderFormText.project(null)).isNull();
    }

    @Test
    @DisplayName("패턴으로 찾을 수 있는 개인정보와 참조를 토큰으로 바꾼다")
    void masksPatternDetectablePersonalData() {
        String projected = ProviderFormText.project(
            "문의 synthetic.user@example.test 또는 010-1234-5678, "
                + "+82 10 9876 5432, 02-123-4567 / https://private.example.test/a?b=c "
                + "www.private-site.kr 주민번호 900101-1234567 계좌 12345678901"
        );

        assertThat(projected).isEqualTo(
            "문의 [EMAIL] 또는 [PHONE], [PHONE], [PHONE] / [URL] [URL] "
                + "주민번호 [ID_NUMBER] 계좌 [NUMBER_11]"
        );
    }

    @Test
    @DisplayName("날짜 형식 예시와 짧은 숫자는 마스킹하지 않는다")
    void keepsFormatHints() {
        assertThat(ProviderFormText.project("예) 2024-03-01, YYYYMMDD, 4.5 만점"))
            .isEqualTo("예) 2024-03-01, YYYYMMDD, 4.5 만점");
        assertThat(ProviderFormText.project("예) 19990101"))
            .isEqualTo("예) [NUMBER_8]");
    }

    @Test
    @DisplayName("마스킹 뒤 120 code point로 자르고 잘린 토큰 조각을 남기지 않는다")
    void limitsLengthWithoutPartialToken() {
        String longText = "가".repeat(130);
        assertThat(ProviderFormText.project(longText)).hasSize(120);

        String emoji = "\uD83D\uDE00".repeat(130);
        String projectedEmoji = ProviderFormText.project(emoji);
        assertThat(projectedEmoji.codePointCount(0, projectedEmoji.length()))
            .isEqualTo(120);

        String nearToken = "가".repeat(117) + " a@b.test";
        assertThat(ProviderFormText.project(nearToken))
            .isEqualTo("가".repeat(117));
    }

    @Test
    @DisplayName("필드와 준비 후보의 의미 문맥 라벨을 출처와 함께 투영한다")
    void projectsSemanticLabels() {
        assertThat(ProviderFormText.projectFields(List.of(
            new FieldsAnalysisRequest.SemanticLabel(
                FieldsAnalysisRequest.SemanticSource.SECTION_HEADING, "희망 근무 조건"
            ),
            new FieldsAnalysisRequest.SemanticLabel(
                FieldsAnalysisRequest.SemanticSource.ARIA_LABEL, "\u200B"
            )
        ))).containsExactly(new ProviderFormText.Label("section-heading", "희망 근무 조건"));

        assertThat(ProviderFormText.projectActions(List.of(
            new PreparationAnalysisRequest.SemanticLabel(
                PreparationAnalysisRequest.SemanticSource.ARIA_LABELLEDBY, "어학 추가"
            )
        ))).containsExactly(new ProviderFormText.Label("aria-labelledby", "어학 추가"));

        assertThat(ProviderFormText.projectFields(null)).isNull();
    }
}
