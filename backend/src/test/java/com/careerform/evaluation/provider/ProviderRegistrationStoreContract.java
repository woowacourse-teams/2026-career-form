package com.careerform.evaluation.provider;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiChoiceModel;

abstract class ProviderRegistrationStoreContract {

    private static final Instant AT = Instant.parse("2026-11-02T05:00:00Z");

    protected abstract ProviderRegistrationStore store();

    private static ProviderRegistration registration(String name, String baseUrl, boolean enabled) {
        return new ProviderRegistration(name, baseUrl, name.equals("gemma") ? null : name, List.of(name + "-model"),
            OpenAiChoiceModel.ResponseFormat.JSON_OBJECT, name.equals("gemma") ? null : "low", 30000, 0.8, enabled,
            "quality-admin", AT);
    }

    @Test
    @DisplayName("이름으로 저장·덮어쓰기·조회하고 이름 순서로 나열한다")
    void savesAndListsByName() {
        ProviderRegistrationStore store = store();
        store.save(registration("together", "https://api.together.xyz/v1", true));
        store.save(registration("gemma", "http://host.docker.internal:11434/v1", true));
        store.save(registration("together", "https://api.together.xyz/v2", false));

        assertThat(store.list()).extracting(ProviderRegistration::name).containsExactly("gemma", "together");
        assertThat(store.find("together").orElseThrow()).isEqualTo(registration("together", "https://api.together.xyz/v2", false));
        assertThat(store.find("gemma").orElseThrow().keyName()).isNull();
        assertThat(store.find("gemma").orElseThrow().reasoningEffort()).isNull();
        assertThat(store.find("missing")).isEmpty();
    }

    @Test
    @DisplayName("변경 기록은 공급자별로 오래된 순서대로 돌려준다")
    void keepsChangesInOrder() {
        ProviderRegistrationStore store = store();
        store.appendChange(new ProviderChange("together", ProviderChange.Action.CREATED, "a", AT, "base-url=x"));
        store.appendChange(new ProviderChange("gemma", ProviderChange.Action.CREATED, "a", AT, "base-url=y"));
        store.appendChange(new ProviderChange("together", ProviderChange.Action.DISABLED, "b", AT.plusSeconds(1), "enabled=false"));

        assertThat(store.changes("together")).extracting(ProviderChange::action)
            .containsExactly(ProviderChange.Action.CREATED, ProviderChange.Action.DISABLED);
        assertThat(store.changes("together").get(1)).isEqualTo(
            new ProviderChange("together", ProviderChange.Action.DISABLED, "b", AT.plusSeconds(1), "enabled=false"));
    }
}
