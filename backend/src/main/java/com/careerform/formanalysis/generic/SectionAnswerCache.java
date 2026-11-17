package com.careerform.formanalysis.generic;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.port.ChoiceModel;
import com.careerform.formanalysis.infrastructure.InteractionProviderConditions;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Ticker;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * 범용 칸 분석에서 공급자에 보낼 내용이 같은 섹션의 답을 프로세스 안에 둔다. 요청에는 양식 구조만 있고 프로필 값이 없어
 * 사용자가 달라도 같은 답을 쓴다. 키는 공급자에 보내는 내용(모델 이름, 섹션 상태, 선택 기준)의 해시이고 값은 질문
 * 번호별 선택과 확신도다. 답을 칸에 붙이는 일과 후처리는 분석기가 요청마다 한다.
 * 찾기와 넣기를 따로 한다. 값을 만드는 함수를 캐시에 넘기면({@code Cache.get(key, 함수)}) 그 함수가 도는 동안 이 캐시의
 * 다른 쓰기 일부가 막힐 수 있는데, 그 함수 안에서 공급자를 부르게 되기 때문이다. 같은 섹션이 처음에 동시에 오면 각자
 * 공급자를 부른다.
 */
@Component
@Conditional(InteractionProviderConditions.JevClient.class)
public final class SectionAnswerCache {

    static final String METRIC = "career.form.analysis.section.cache";
    /** Map의 키를 정렬해 쓴다. 불변 Map의 순서는 실행마다 달라 그대로 쓰면 같은 내용도 키가 달라진다. */
    private static final JsonMapper CANONICAL = JsonMapper.builder()
        .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS).build();

    /** 꺼져 있으면 null이다. */
    private final Cache<String, Map<String, ChoiceModel.Judgement>> answers;
    private final Counter hits;
    private final Counter misses;

    @Autowired
    public SectionAnswerCache(
        @Value("${career-form.analysis.jev.section-cache.enabled:true}") boolean enabled,
        @Value("${career-form.analysis.jev.section-cache.max-sections:5000}") long maxSections,
        @Value("${career-form.analysis.jev.section-cache.ttl:7d}") Duration ttl,
        MeterRegistry registry
    ) {
        this(enabled, maxSections, ttl, registry, Ticker.systemTicker());
    }

    SectionAnswerCache(boolean enabled, long maxSections, Duration ttl, MeterRegistry registry, Ticker ticker) {
        if (enabled && (maxSections < 1 || ttl == null || ttl.isZero() || ttl.isNegative() || registry == null)) {
            throw new IllegalStateException("Invalid generic section answer cache configuration");
        }
        this.answers = enabled
            ? Caffeine.newBuilder().maximumSize(maxSections).expireAfterWrite(ttl).ticker(ticker).build()
            : null;
        this.hits = registry == null ? null : registry.counter(METRIC, "outcome", "hit");
        this.misses = registry == null ? null : registry.counter(METRIC, "outcome", "miss");
    }

    /** 평가용 사본과 Spring 밖에서 만든 분석기가 쓰는 꺼진 캐시. 읽지도 쓰지도 세지도 않는다. */
    static SectionAnswerCache disabled() {
        return new SectionAnswerCache(false, 0, Duration.ZERO, null, Ticker.systemTicker());
    }

    boolean enabled() {
        return answers != null;
    }

    /** 공급자에 보내는 내용의 SHA-256. 요청마다 달라지는 식별자(snapshotId, candidateId, DOM id, host, 경로)는 여기에 없다. */
    String key(String model, Map<String, Object> state, Map<String, String> criteria) {
        Map<String, Object> sent = new LinkedHashMap<>();
        sent.put("model", model);
        sent.put("state", state);
        sent.put("criteria", criteria);
        try {
            return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(CANONICAL.writeValueAsBytes(sent)));
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    /** 저장된 답이 있으면 돌려주고 없으면 null이다. 켜져 있을 때만 적중과 실패를 센다. */
    Map<String, ChoiceModel.Judgement> find(String key) {
        if (answers == null) {
            return null;
        }
        Map<String, ChoiceModel.Judgement> found = answers.getIfPresent(key);
        (found == null ? misses : hits).increment();
        return found;
    }

    /** 모든 질문에 답을 받은 섹션만 호출한다. 분석이 쓰는 선택과 확신도만 남기고 선택지별 확률은 버린다. */
    void store(String key, Map<String, ChoiceModel.Judgement> judgements) {
        if (answers == null) {
            return;
        }
        Map<String, ChoiceModel.Judgement> kept = new HashMap<>();
        judgements.forEach((questionId, judgement) -> kept.put(questionId,
            new ChoiceModel.Judgement(judgement.choice(), judgement.confidence(), Map.of())));
        answers.put(key, Map.copyOf(kept));
    }

    /** 밀린 정리를 끝낸 뒤의 저장 섹션 수. */
    long size() {
        if (answers == null) {
            return 0;
        }
        answers.cleanUp();
        return answers.estimatedSize();
    }
}
