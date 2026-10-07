package com.careerform.quality;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.careerform.monitoring.ExternalCallObserver;

@Component
@ConditionalOnProperty(prefix = "career-form.quality", name = "enabled", havingValue = "true")
public final class QualityAiObserver implements ExternalCallObserver {
    @Override
    public void recorded(String provider, String operation, String outcome, long durationMs) {
        recorded(provider, operation, outcome, durationMs, new ExternalCallObserver.Context(true, "UNKNOWN"));
    }

    @Override
    public void recorded(String provider, String operation, String outcome, long durationMs, ExternalCallObserver.Context context) {
        if (!context.called()) { return; }
        if ((provider.equals("openai") || provider.equals("jev"))
            && (operation.equals("analysis") || operation.equals("interaction"))) {
            var version = context.modelVersion() != null && context.modelVersion().matches("[0-9a-f]{64}") ? context.modelVersion() : "UNKNOWN";
            QualityScope.current().ifPresent(scope -> scope.call(new QualityCollectionService.AiCall(provider, operation, outcome, durationMs, version)));
        }
    }
}
