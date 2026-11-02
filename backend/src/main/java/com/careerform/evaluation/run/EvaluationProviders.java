package com.careerform.evaluation.run;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.Supplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.careerform.formanalysis.application.PromptSource;
import com.careerform.formanalysis.application.port.ChoiceModel;

/**
 * 평가에서 고를 수 있는 공급자 목록. 첫 공급자가 기본값이다. 새 공급자는 {@link ChoiceModel} 구현과 이 목록의
 * 항목 하나로 추가하거나, OpenAI 호환이면 평가 화면에서 등록한다. 제품의 공급자 선택과는 무관하다.
 */
public final class EvaluationProviders {

    private static final Logger log = LoggerFactory.getLogger(EvaluationProviders.class);

    /**
     * @param models 허용 모델. 첫 모델이 기본값이다.
     * @param settings 결과에 영향을 주는 공급자 설정(실행 버전과 지문에 남는다).
     * @param promptSources 공급자 연결부가 따로 보내는 고정 문구(예: 시스템 문구). 공통 질문 문구는 넣지 않는다.
     * @param model 모델 이름으로 선택 모델을 만든다.
     */
    public record Provider(String name, List<String> models, Map<String, String> settings,
        List<? extends PromptSource> promptSources, Function<String, ChoiceModel> model) {

        public Provider {
            if (name == null || name.isBlank() || models == null || models.isEmpty()) {
                throw new IllegalStateException("평가 공급자에는 이름과 모델이 하나 이상 있어야 합니다");
            }
            models = List.copyOf(models);
            settings = Map.copyOf(settings);
            promptSources = List.copyOf(promptSources);
        }

        public String defaultModel() {
            return models.getFirst();
        }
    }

    private final Map<String, Provider> configured = new LinkedHashMap<>();
    private final Supplier<List<Provider>> registered;

    public EvaluationProviders(List<Provider> providers) {
        this(providers, List::of);
    }

    /**
     * {@code registered}는 화면에서 등록한 공급자를 부를 때마다 다시 읽는다. 서버 설정 공급자와 이름이 같으면 서버 설정이
     * 이기고, 읽기에 실패해도 서버 설정 공급자는 그대로 쓴다.
     */
    public EvaluationProviders(List<Provider> providers, Supplier<List<Provider>> registered) {
        providers.forEach(provider -> {
            if (this.configured.putIfAbsent(provider.name(), provider) != null) {
                throw new IllegalStateException("평가 공급자 이름이 겹칩니다: " + provider.name());
            }
        });
        this.registered = registered;
    }

    public List<Provider> all() {
        Map<String, Provider> merged = new LinkedHashMap<>(configured);
        List<Provider> extra;
        try {
            extra = registered.get();
        }
        catch (RuntimeException exception) {
            log.warn("EVALUATION_PROVIDER_REGISTRY_UNAVAILABLE reason={}", exception.getClass().getSimpleName());
            extra = List.of();
        }
        extra.forEach(provider -> merged.putIfAbsent(provider.name(), provider));
        return List.copyOf(merged.values());
    }

    public Optional<Provider> find(String name) {
        if (name == null) {
            return Optional.empty();
        }
        return all().stream().filter(provider -> provider.name().equals(name)).findFirst();
    }

    public Optional<Provider> defaultProvider() {
        return all().stream().findFirst();
    }
}
