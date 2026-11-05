package com.careerform.evaluation.run;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("평가 공급자 목록: 서버 설정 공급자와 화면에서 등록한 공급자")
class EvaluationProvidersTest {

    private static EvaluationProviders.Provider provider(String name, String model) {
        return new EvaluationProviders.Provider(name, List.of(model), Map.of(), List.of(), ignored -> null);
    }

    @Test
    @DisplayName("등록 공급자는 부를 때마다 다시 읽어 서버 설정 공급자 뒤에 붙고, 같은 이름이면 서버 설정이 이긴다")
    void mergesRegisteredProvidersOnEveryRead() {
        List<EvaluationProviders.Provider> registered = new ArrayList<>();
        EvaluationProviders providers = new EvaluationProviders(List.of(provider("jev", "jev-latest")), () -> registered);

        registered.add(provider("deepseek", "deepseek-chat"));
        registered.add(provider("jev", "shadow"));

        assertThat(providers.all()).extracting(EvaluationProviders.Provider::name).containsExactly("jev", "deepseek");
        assertThat(providers.find("jev").orElseThrow().models()).containsExactly("jev-latest");
        assertThat(providers.find("deepseek")).isPresent();
        assertThat(providers.defaultProvider().orElseThrow().name()).isEqualTo("jev");
        registered.clear();
        assertThat(providers.find("deepseek")).isEmpty();
    }

    @Test
    @DisplayName("등록 공급자를 읽지 못해도 서버 설정 공급자는 쓸 수 있다")
    void registryFailureKeepsConfiguredProviders() {
        EvaluationProviders providers = new EvaluationProviders(List.of(provider("jev", "jev-latest")), () -> {
            throw new IllegalStateException("store down");
        });

        assertThat(providers.all()).extracting(EvaluationProviders.Provider::name).containsExactly("jev");
    }
}
