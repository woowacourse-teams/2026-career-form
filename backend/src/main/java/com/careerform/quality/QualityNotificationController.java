package com.careerform.quality;

import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@ConditionalOnProperty(prefix = "career-form.quality", name = "enabled", havingValue = "true")
public final class QualityNotificationController {
    private final QualityDailyBatch batches;

    public QualityNotificationController(QualityDailyBatch batches) { this.batches = batches; }

    @GetMapping("/api/v1/quality/notifications")
    public Map<String, Object> latest() {
        var batch = batches.latest();
        if (batch == null) { return Map.of("message", "아직 오늘의 확인 요청을 선정하지 않았습니다.", "entries", java.util.List.of()); }
        var state = switch (batch.status()) {
            case SENT -> "전송 완료";
            case NOT_CONFIGURED -> "전용 알림 설정 없음";
            case READY -> "전송 대기";
            case SENDING -> "전송 중";
            case REJECTED -> "전송 거부됨";
            case UNKNOWN -> "전달 여부 미확인, 자동 재전송 안 함";
        };
        return Map.of("message", batch.dateKst() + " 확인 요청: " + state, "dateKst", batch.dateKst(), "status", batch.status(), "entries", batch.entries());
    }
}
