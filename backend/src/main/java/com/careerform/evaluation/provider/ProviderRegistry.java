package com.careerform.evaluation.provider;

import java.net.URI;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.SortedMap;
import java.util.stream.Collectors;

import com.careerform.evaluation.run.EvaluationProviders;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiChoiceModel;

/**
 * 화면에서 등록한 OpenAI 호환 공급자를 검증해 저장하고 평가 공급자로 만든다. 주소는 저장할 때와 모델을 만들 때마다
 * {@link EndpointPolicy}로 확인하고, 키 원문은 키 묶음에서 전송부로만 넘긴다. 제품의 공급자 선택과는 무관하다.
 */
public final class ProviderRegistry {

    static final int RATE_LIMIT_RETRIES = 2;
    private static final Set<String> RESERVED = Set.of("jev", "openai");
    private static final int MAX_MODELS = 10;
    private static final int MAX_MODEL_NAME = 80;

    /** 주소·키·시간 제한으로 HTTP 전송을 만든다. 실제 서버는 {@link OpenAiChoiceModel#http(URI, String, int)}. */
    @FunctionalInterface
    public interface TransportFactory {
        OpenAiChoiceModel.Transport create(URI endpoint, String key, int timeoutMs);
    }

    public record Input(String name, String baseUrl, String keyName, List<String> models,
        OpenAiChoiceModel.ResponseFormat format, String reasoningEffort, int timeoutMs, double minConfidence) {
    }

    private final ProviderRegistrationStore store;
    private final EndpointPolicy policy;
    private final ProviderKeys keys;
    private final Clock clock;
    private final TransportFactory transports;

    public ProviderRegistry(ProviderRegistrationStore store, EndpointPolicy policy, ProviderKeys keys, Clock clock,
        TransportFactory transports) {
        this.store = store;
        this.policy = policy;
        this.keys = keys;
        this.clock = clock;
        this.transports = transports;
    }

    /** 키 묶음의 이름과 그 키를 보낼 수 있는 호스트. 화면에서 고를 수 있는 키다. 키 원문은 없다. */
    public Map<String, Set<String>> keyHosts() {
        Map<String, Set<String>> hosts = new java.util.TreeMap<>();
        keys.names().forEach(name -> hosts.put(name, keys.hosts(name)));
        return hosts;
    }

    public List<ProviderRegistration> list() {
        return store.list();
    }

    public List<ProviderChange> changes(String name) {
        return store.changes(name);
    }

    /** 새로 등록하거나 같은 이름의 등록을 바꾼다. 저장하면 다시 켜진다. */
    public synchronized ProviderRegistration save(Input input, String by) {
        ProviderRegistration next = validate(input, by);
        var previous = store.find(next.name());
        store.save(next);
        store.appendChange(new ProviderChange(next.name(),
            previous.isEmpty() ? ProviderChange.Action.CREATED : ProviderChange.Action.UPDATED, by, next.updatedAt(),
            summary(previous.map(ProviderRegistry::describe).orElse(Map.of()), describe(next))));
        return next;
    }

    public synchronized ProviderRegistration disable(String name, String by) {
        ProviderRegistration current = store.find(name)
            .orElseThrow(() -> new ProviderRejected(ProviderRejected.Code.UNKNOWN_PROVIDER));
        ProviderRegistration disabled = new ProviderRegistration(current.name(), current.baseUrl(), current.keyName(),
            current.models(), current.format(), current.reasoningEffort(), current.timeoutMs(), current.minConfidence(),
            false, by, clock.instant());
        store.save(disabled);
        store.appendChange(new ProviderChange(name, ProviderChange.Action.DISABLED, by, disabled.updatedAt(), "enabled=false"));
        return disabled;
    }

    /** 켜진 등록을 평가 공급자로. 주소는 모델을 만들 때 다시 확인한다. */
    public List<EvaluationProviders.Provider> providers() {
        List<EvaluationProviders.Provider> providers = new ArrayList<>();
        for (ProviderRegistration registration : store.list()) {
            if (!registration.enabled()) {
                continue;
            }
            OpenAiChoiceModel promptOnly = model(registration, registration.models().getFirst(), body -> {
                throw new IllegalStateException("프롬프트 기록 전용");
            });
            providers.add(new EvaluationProviders.Provider(registration.name(), registration.models(),
                registration.settings(), List.of(promptOnly), name -> connect(registration, name)));
        }
        return providers;
    }

    private OpenAiChoiceModel connect(ProviderRegistration registration, String model) {
        URI endpoint = policy.endpoint(registration.baseUrl(), registration.keyName());
        String key = registration.keyName() == null ? null : keys.secret(registration.keyName())
            .orElseThrow(() -> new ProviderRejected(ProviderRejected.Code.UNKNOWN_KEY));
        return model(registration, model, transports.create(endpoint, key, registration.timeoutMs()));
    }

    private static OpenAiChoiceModel model(ProviderRegistration registration, String model,
        OpenAiChoiceModel.Transport transport) {
        return new OpenAiChoiceModel(transport, new OpenAiChoiceModel.Protocol(registration.name(),
            registration.format(), registration.reasoningEffort()), model, registration.minConfidence(),
            RATE_LIMIT_RETRIES, delay -> Thread.sleep(delay));
    }

    private ProviderRegistration validate(Input input, String by) {
        if (input == null || input.name() == null || !ProviderKeys.NAME.matcher(input.name()).matches()
            || input.format() == null || input.models() == null || input.models().isEmpty()
            || input.models().size() > MAX_MODELS || input.timeoutMs() < 1000 || input.timeoutMs() > 120_000
            || !(input.minConfidence() >= 0 && input.minConfidence() <= 1)
            || (input.reasoningEffort() != null && !input.reasoningEffort().matches("^[a-z]{1,16}$"))
            || input.models().stream().anyMatch(model -> model == null || model.isBlank()
                || model.length() > MAX_MODEL_NAME || !model.matches("^[A-Za-z0-9._:/-]+$"))
            || input.models().stream().distinct().count() != input.models().size()) {
            throw new ProviderRejected(ProviderRejected.Code.INVALID);
        }
        if (RESERVED.contains(input.name())) {
            throw new ProviderRejected(ProviderRejected.Code.RESERVED_NAME);
        }
        String keyName = input.keyName() == null || input.keyName().isBlank() ? null : input.keyName();
        policy.endpoint(input.baseUrl(), keyName);
        return new ProviderRegistration(input.name(), input.baseUrl().trim(), keyName, input.models(), input.format(),
            input.reasoningEffort(), input.timeoutMs(), input.minConfidence(), true, by, clock.instant());
    }

    private static Map<String, String> describe(ProviderRegistration registration) {
        SortedMap<String, String> values = registration.settings();
        values.put("models", String.join(",", registration.models()));
        values.put("enabled", String.valueOf(registration.enabled()));
        return values;
    }

    private static String summary(Map<String, String> before, Map<String, String> after) {
        return new java.util.TreeSet<>(after.keySet()).stream()
            .filter(key -> !Objects.equals(before.get(key), after.get(key)))
            .map(key -> before.containsKey(key) ? key + "=" + before.get(key) + "→" + after.get(key)
                : key + "=" + after.get(key))
            .collect(Collectors.joining(", "));
    }
}
