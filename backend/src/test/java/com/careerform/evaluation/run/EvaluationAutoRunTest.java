package com.careerform.evaluation.run;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.careerform.evaluation.EvaluationTestData;
import com.careerform.evaluation.prompt.PromptCatalog;

@DisplayName("평가에 영향을 주는 변경 뒤 자동 평가")
class EvaluationAutoRunTest {

    private static final Instant NOW = Instant.parse("2026-11-03T00:00:00Z");
    private static final Map<String, String> BASE = Map.of(EvaluationAutoRun.BEHAVIOR, "b1", EvaluationAutoRun.PROMPT, "p1",
        EvaluationAutoRun.SETTINGS, "s1", EvaluationAutoRun.PROVIDER, "a1", EvaluationAutoRun.DATASET, "d1");
    private final InMemoryRunStore store = new InMemoryRunStore();

    private EvaluationAutoRun autoRun(String codeVersion, boolean enabled, Map<String, String> inputs) {
        RunService service = new RunService(store, EvaluationTestData.syntheticLoader(), new PromptCatalog(),
            List.of(EvaluationTestData.PROMPT), EvaluationTestData.PROVIDERS,
            new EvaluationSettings(100, 20, codeVersion, Map.of("field-batch-size", 5)), Clock.fixed(NOW, ZoneOffset.UTC));
        return new EvaluationAutoRun(service, store, EvaluationTestData.PROVIDERS,
            new EvaluationAutoRun.Settings(enabled, "synthetic", 1, 3), codeVersion, () -> inputs);
    }

    private static Map<String, String> changed(String... keys) {
        Map<String, String> inputs = new HashMap<>(BASE);
        for (String key : keys) {
            inputs.put(key, "changed");
        }
        return inputs;
    }

    /** 먼저 기록을 남기고 끝낸 뒤, 새 코드 버전으로 바뀐 입력을 돌렸을 때의 실행 이름. 등록하지 않으면 null이다. */
    private String nameAfter(Map<String, String> inputs) {
        assertThat(autoRun("aaaaaaa", true, BASE).runIfChanged()).isTrue();
        finishLatest();
        boolean registered = autoRun("bbbbbbb", true, inputs).runIfChanged();
        return registered ? store.recent(10).getFirst().versions().promptVersion() : null;
    }

    private void finishLatest() {
        EvaluationRun latest = store.recent(10).getFirst();
        store.comparison(latest.comparisonId()).forEach(run -> {
            store.transition(run.id(), RunStatus.WAITING, RunStatus.CANCELLED, NOW);
            store.transition(run.id(), RunStatus.QUEUED, RunStatus.CANCELLED, NOW);
        });
    }

    @Test
    @DisplayName("첫 평가는 공급자마다 기본 모델로 등록하고 이름에 first와 커밋을 쓰며, 실행자는 auto-deploy다")
    void firstRunIsNamedFirst() {
        assertThat(autoRun("391fbd8", true, BASE).runIfChanged()).isTrue();

        EvaluationRun run = store.recent(10).getFirst();
        assertThat(run.versions().promptVersion()).isEqualTo("first-391fbd8");
        assertThat(run.versions().inputs()).isEqualTo(BASE);
        assertThat(run.versions().model()).isEqualTo("jev-latest");
        assertThat(run.repetitions()).isEqualTo(3);
        assertThat(run.requestedBy()).isEqualTo("auto-deploy");
    }

    @Test
    @DisplayName("커밋만 바뀌고 평가 입력이 같으면(변수명 변경 등) 돌리지 않는다")
    void sameInputsDoNotRun() {
        assertThat(nameAfter(BASE)).isNull();
    }

    @Test
    @DisplayName("바뀐 입력을 이름으로 짓는다. 프롬프트가 바뀌면 호출 구조도 달라지므로 prompt만 쓴다")
    void namesWhatChanged() {
        assertThat(nameAfter(changed(EvaluationAutoRun.BEHAVIOR))).isEqualTo("call-bbbbbbb");
        finishLatest();
        assertThat(autoRun("ccccccc", true, changed(EvaluationAutoRun.BEHAVIOR, EvaluationAutoRun.PROMPT)).runIfChanged()).isTrue();
        assertThat(store.recent(10).getFirst().versions().promptVersion()).isEqualTo("prompt-ccccccc");
    }

    @Test
    @DisplayName("설정·공급자 연결·데이터셋 변경도 돌리고, 여러 개면 이어 붙인다")
    void namesOtherInputs() {
        assertThat(nameAfter(changed(EvaluationAutoRun.SETTINGS, EvaluationAutoRun.DATASET))).isEqualTo("settings-dataset-bbbbbbb");
        finishLatest();
        Map<String, String> provider = changed(EvaluationAutoRun.SETTINGS, EvaluationAutoRun.DATASET);
        provider.put(EvaluationAutoRun.PROVIDER, "a2");
        assertThat(autoRun("ccccccc", true, provider).runIfChanged()).isTrue();
        assertThat(store.recent(10).getFirst().versions().promptVersion()).isEqualTo("provider-ccccccc");
    }

    @Test
    @DisplayName("이름이 32자를 넘으면 multi로 줄이고, 이미지 digest 코드 버전은 digest 앞 7자를 쓴다")
    void longNamesAndImageVersions() {
        assertThat(EvaluationAutoRun.name(BASE, changed(EvaluationAutoRun.PROMPT, EvaluationAutoRun.SETTINGS,
            EvaluationAutoRun.PROVIDER, EvaluationAutoRun.DATASET), "391fbd8")).isEqualTo("multi-391fbd8");
        assertThat(EvaluationAutoRun.name(null, BASE, "registry/app@sha256:abcdef1234")).isEqualTo("first-abcdef1");
    }

    @Test
    @DisplayName("꺼져 있거나 코드 버전을 모르면 등록하지 않는다")
    void skipsWhenDisabledOrUnknown() {
        assertThat(autoRun("aaaaaaa", false, BASE).runIfChanged()).isFalse();
        assertThat(autoRun("UNKNOWN", true, BASE).runIfChanged()).isFalse();
        assertThat(store.recent(10)).isEmpty();
    }

    @Test
    @DisplayName("진행 중인 평가가 있으면 등록을 건너뛰고 실패로 끝내지 않는다")
    void skipsWhileAnotherRunIsActive() {
        assertThat(autoRun("aaaaaaa", true, BASE).runIfChanged()).isTrue();

        assertThat(autoRun("bbbbbbb", true, changed(EvaluationAutoRun.PROMPT)).runIfChanged()).isFalse();
        assertThat(store.recent(10)).hasSize(EvaluationTestData.PROVIDERS.all().size());
    }
}
