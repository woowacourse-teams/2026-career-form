package com.careerform.evaluation.run;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.careerform.evaluation.EvaluationTestData;
import com.careerform.evaluation.prompt.PromptCatalog;

@DisplayName("새 코드 배포 뒤 자동 평가")
class EvaluationAutoRunTest {

    private static final Instant NOW = Instant.parse("2026-11-03T00:00:00Z");
    private final InMemoryRunStore store = new InMemoryRunStore();

    private EvaluationAutoRun autoRun(String codeVersion, boolean enabled) {
        RunService service = new RunService(store, EvaluationTestData.syntheticLoader(), new PromptCatalog(),
            List.of(EvaluationTestData.PROMPT), EvaluationTestData.PROVIDERS,
            new EvaluationSettings(100, 20, codeVersion, Map.of("field-batch-size", 5)), Clock.fixed(NOW, ZoneOffset.UTC));
        return new EvaluationAutoRun(service, store, EvaluationTestData.PROVIDERS,
            new EvaluationAutoRun.Settings(enabled, "synthetic", 1, 3, "auto-deploy"), codeVersion);
    }

    @Test
    @DisplayName("이 코드 버전으로 돌린 평가가 없으면 공급자마다 기본 모델로 한 번 등록하고, 이미 있으면 다시 등록하지 않는다")
    void registersOncePerCodeVersion() {
        EvaluationAutoRun first = autoRun("image@sha256:aaa", true);

        assertThat(first.runIfNewCode()).isTrue();
        EvaluationRun run = store.recent(10).getFirst();
        assertThat(run.versions().codeVersion()).isEqualTo("image@sha256:aaa");
        assertThat(run.versions().promptVersion()).isEqualTo("auto-deploy");
        assertThat(run.versions().model()).isEqualTo("jev-latest");
        assertThat(run.repetitions()).isEqualTo(3);
        assertThat(run.requestedBy()).isEqualTo("auto-deploy");

        store.transition(run.id(), RunStatus.QUEUED, RunStatus.CANCELLED, NOW);
        assertThat(autoRun("image@sha256:aaa", true).runIfNewCode()).isFalse();
        assertThat(autoRun("image@sha256:bbb", true).runIfNewCode()).isTrue();
    }

    @Test
    @DisplayName("꺼져 있거나 코드 버전을 모르면 등록하지 않는다")
    void skipsWhenDisabledOrUnknown() {
        assertThat(autoRun("image@sha256:aaa", false).runIfNewCode()).isFalse();
        assertThat(autoRun("UNKNOWN", true).runIfNewCode()).isFalse();
        assertThat(store.recent(10)).isEmpty();
    }

    @Test
    @DisplayName("진행 중인 평가가 있으면 등록을 건너뛰고 실패로 끝내지 않는다")
    void skipsWhileAnotherRunIsActive() {
        assertThat(autoRun("image@sha256:aaa", true).runIfNewCode()).isTrue();

        assertThat(autoRun("image@sha256:bbb", true).runIfNewCode()).isFalse();
        assertThat(store.recent(10)).hasSize(1);
    }
}
