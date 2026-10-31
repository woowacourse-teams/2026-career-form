package com.careerform.evaluation.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.evaluation.run.EvaluationProviders;
import com.careerform.formanalysis.infrastructure.adapter.jev.JevChoiceModel;
import com.careerform.formanalysis.infrastructure.adapter.jev.JevClient;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiChoiceModel;

@DisplayName("평가 공급자 목록 조립")
class EvaluationProvidersConfigurationTest {

    private final EvaluationConfiguration configuration = new EvaluationConfiguration();
    private final JevChoiceModel jev = new JevChoiceModel(new JevClient("synthetic-key", "jev-latest", 8000, 0.8, true));

    private EvaluationProviders providers(Optional<JevChoiceModel> jev, boolean openAiEnabled, String key) {
        return configuration.evaluationProviders(jev, 8000, 2, openAiEnabled, key, List.of("gpt-6-luna", "gpt-5.6-luna"),
            "none", 30000, 0.8, 2);
    }

    @Test
    @DisplayName("JEV가 기본 공급자이고, OpenAI는 평가 설정을 켜고 키가 있을 때 모델 목록·설정·시스템 문구와 함께 들어간다")
    void registersJevThenOpenAi() {
        EvaluationProviders providers = providers(Optional.of(jev), true, "synthetic-openai-key");

        assertThat(providers.all()).extracting(EvaluationProviders.Provider::name).containsExactly("jev", "openai");
        assertThat(providers.defaultProvider()).get().extracting(EvaluationProviders.Provider::name).isEqualTo("jev");
        EvaluationProviders.Provider jevProvider = providers.find("jev").orElseThrow();
        assertThat(jevProvider.models()).containsExactly("jev-latest");
        assertThat(jevProvider.settings()).containsEntry("timeout-ms", "8000").containsEntry("rate-limit-retries", "2");
        assertThat(jevProvider.model().apply("jev-latest")).isSameAs(jev);
        EvaluationProviders.Provider openAi = providers.find("openai").orElseThrow();
        assertThat(openAi.defaultModel()).isEqualTo("gpt-6-luna");
        assertThat(openAi.settings()).containsEntry("reasoning-effort", "none").containsEntry("timeout-ms", "30000")
            .containsEntry("min-confidence", "0.8");
        assertThat(openAi.promptSources()).singleElement()
            .satisfies(source -> assertThat(source.promptParts()).containsEntry("system", OpenAiChoiceModel.SYSTEM_PROMPT));
        assertThat(openAi.model().apply("gpt-5.6-luna").model()).isEqualTo("gpt-5.6-luna");
        assertThat(openAi.model().apply("gpt-6-luna").provider()).isEqualTo("openai");
    }

    @Test
    @DisplayName("OpenAI는 평가 설정이 꺼져 있거나 키가 없으면 목록에 없고, JEV 연결이 없으면 OpenAI가 기본이다")
    void openAiNeedsOptInAndKey() {
        assertThat(providers(Optional.of(jev), false, "synthetic-openai-key").all())
            .extracting(EvaluationProviders.Provider::name).containsExactly("jev");
        assertThat(providers(Optional.of(jev), true, " ").all())
            .extracting(EvaluationProviders.Provider::name).containsExactly("jev");
        assertThat(providers(Optional.empty(), true, "synthetic-openai-key").defaultProvider()).get()
            .extracting(EvaluationProviders.Provider::name).isEqualTo("openai");
    }
}
