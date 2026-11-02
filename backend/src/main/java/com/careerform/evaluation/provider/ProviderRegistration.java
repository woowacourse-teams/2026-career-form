package com.careerform.evaluation.provider;

import java.time.Instant;
import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;

import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiChoiceModel;

/**
 * 화면에서 등록한 OpenAI 호환 평가 공급자. 키 원문은 없고 키 묶음의 이름만 가진다. {@code reasoningEffort}가 null이면
 * 추론 옵션을 보내지 않는다.
 */
public record ProviderRegistration(
    String name,
    String baseUrl,
    String keyName,
    List<String> models,
    OpenAiChoiceModel.ResponseFormat format,
    String reasoningEffort,
    int timeoutMs,
    double minConfidence,
    boolean enabled,
    String updatedBy,
    Instant updatedAt
) {

    public ProviderRegistration {
        models = List.copyOf(models);
    }

    /** 실행 버전과 지문에 남는 설정. 결과에 영향을 주는 값만 담고 키 원문은 담지 않는다. */
    public SortedMap<String, String> settings() {
        SortedMap<String, String> settings = new TreeMap<>();
        settings.put("base-url", baseUrl);
        if (keyName != null) {
            settings.put("key-name", keyName);
        }
        settings.put("response-format", format.name());
        if (reasoningEffort != null) {
            settings.put("reasoning-effort", reasoningEffort);
        }
        settings.put("timeout-ms", String.valueOf(timeoutMs));
        settings.put("min-confidence", String.valueOf(minConfidence));
        settings.put("rate-limit-retries", String.valueOf(ProviderRegistry.RATE_LIMIT_RETRIES));
        return settings;
    }
}
