package com.careerform.evaluation.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.InetAddress;
import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.evaluation.run.EvaluationProviders;
import com.careerform.formanalysis.application.port.ChoiceModel;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiChoiceModel;

@DisplayName("평가 공급자 등록: 화면에서 등록한 OpenAI 호환 공급자를 평가 공급자로 만든다")
class ProviderRegistryTest {

    private static final Instant NOW = Instant.parse("2026-11-02T05:00:00Z");
    private static final ProviderKeys KEYS = ProviderKeys.parse(
        "{\"deepseek\":{\"key\":\"sk-secret\",\"hosts\":[\"api.deepseek.com\"]}}");
    private static final Map<String, String> DNS = Map.of("api.deepseek.com", "8.8.8.8", "evil.example.com", "9.9.9.9");

    record Sent(URI endpoint, String key, int timeoutMs) {
    }

    private final List<Sent> sent = new ArrayList<>();
    private final InMemoryProviderRegistrationStore store = new InMemoryProviderRegistrationStore();

    private ProviderRegistry registry() {
        EndpointPolicy policy = new EndpointPolicy(KEYS, false, host -> List.of(InetAddress.getByName(DNS.get(host))));
        return new ProviderRegistry(store, policy, KEYS, Clock.fixed(NOW, ZoneOffset.UTC), (endpoint, key, timeoutMs) -> {
            sent.add(new Sent(endpoint, key, timeoutMs));
            return body -> new OpenAiChoiceModel.Reply(500, "{}");
        });
    }

    private static ProviderRegistry.Input deepseek() {
        return new ProviderRegistry.Input("deepseek", "https://api.deepseek.com/v1", "deepseek",
            List.of("deepseek-chat", "deepseek-reasoner"), OpenAiChoiceModel.ResponseFormat.JSON_OBJECT, null,
            30000, 0.8);
    }

    @Test
    @DisplayName("등록한 공급자는 키 없이 저장되고, 평가 공급자로 모델과 결과에 남길 설정을 갖는다")
    void registeredProviderBecomesEvaluationProvider() {
        ProviderRegistry registry = registry();

        registry.save(deepseek(), "quality-admin");

        assertThat(store.list()).singleElement().satisfies(saved -> {
            assertThat(saved.keyName()).isEqualTo("deepseek");
            assertThat(saved.toString()).doesNotContain("sk-secret");
        });
        EvaluationProviders.Provider provider = registry.providers().getFirst();
        assertThat(provider.name()).isEqualTo("deepseek");
        assertThat(provider.models()).containsExactly("deepseek-chat", "deepseek-reasoner");
        assertThat(provider.settings()).containsEntry("base-url", "https://api.deepseek.com/v1")
            .containsEntry("key-name", "deepseek").containsEntry("response-format", "JSON_OBJECT")
            .containsEntry("timeout-ms", "30000").containsEntry("min-confidence", "0.8")
            .doesNotContainKey("reasoning-effort");
        assertThat(provider.settings().values()).noneMatch(value -> value.contains("sk-secret"));
        ChoiceModel model = provider.model().apply("deepseek-reasoner");
        assertThat(model.provider()).isEqualTo("deepseek");
        assertThat(model.model()).isEqualTo("deepseek-reasoner");
        assertThat(sent).last().isEqualTo(new Sent(URI.create("https://api.deepseek.com/v1/chat/completions"),
            "sk-secret", 30000));
    }

    @Test
    @DisplayName("내장 공급자 이름, 잘못된 값, 키 호스트 밖 주소는 저장하지 않는다")
    void rejectsInvalidRegistrations() {
        ProviderRegistry registry = registry();
        var base = deepseek();
        List<ProviderRegistry.Input> invalid = List.of(
            new ProviderRegistry.Input("openai", base.baseUrl(), base.keyName(), base.models(), base.format(), null, 30000, 0.8),
            new ProviderRegistry.Input("jev", base.baseUrl(), base.keyName(), base.models(), base.format(), null, 30000, 0.8),
            new ProviderRegistry.Input("Deep Seek", base.baseUrl(), base.keyName(), base.models(), base.format(), null, 30000, 0.8),
            new ProviderRegistry.Input("deepseek", base.baseUrl(), base.keyName(), List.of(), base.format(), null, 30000, 0.8),
            new ProviderRegistry.Input("deepseek", base.baseUrl(), base.keyName(), base.models(), base.format(), null, 10, 0.8),
            new ProviderRegistry.Input("deepseek", base.baseUrl(), base.keyName(), base.models(), base.format(), null, 30000, 1.5),
            new ProviderRegistry.Input("deepseek", "https://evil.example.com/v1", "deepseek", base.models(), base.format(), null, 30000, 0.8));
        for (ProviderRegistry.Input input : invalid) {
            assertThatThrownBy(() -> registry.save(input, "quality-admin")).isInstanceOf(ProviderRejected.class);
        }
        assertThat(store.list()).isEmpty();
    }

    @Test
    @DisplayName("비활성화한 공급자는 평가 공급자에서 빠지고 등록 목록과 변경 기록에는 남는다")
    void disabledProviderLeavesEvaluationButKeepsHistory() {
        ProviderRegistry registry = registry();
        registry.save(deepseek(), "quality-admin");
        var updated = deepseek();
        registry.save(new ProviderRegistry.Input(updated.name(), updated.baseUrl(), updated.keyName(),
            List.of("deepseek-chat"), updated.format(), null, 20000, 0.7), "quality-admin");

        registry.disable("deepseek", "quality-admin");

        assertThat(registry.providers()).isEmpty();
        assertThat(registry.list()).singleElement().extracting(ProviderRegistration::enabled).isEqualTo(false);
        assertThat(store.changes("deepseek")).extracting(ProviderChange::action)
            .containsExactly(ProviderChange.Action.CREATED, ProviderChange.Action.UPDATED, ProviderChange.Action.DISABLED);
        assertThat(store.changes("deepseek")).allSatisfy(change -> {
            assertThat(change.by()).isEqualTo("quality-admin");
            assertThat(change.at()).isEqualTo(NOW);
            assertThat(change.toString()).doesNotContain("sk-secret");
        });
        assertThat(store.changes("deepseek").get(1).summary()).contains("timeout-ms", "20000");
    }

    @Test
    @DisplayName("없는 공급자는 비활성화할 수 없다")
    void disablingUnknownProviderIsRejected() {
        assertThatThrownBy(() -> registry().disable("missing", "quality-admin"))
            .extracting(error -> ((ProviderRejected) error).code()).isEqualTo(ProviderRejected.Code.UNKNOWN_PROVIDER);
    }
}
