package com.careerform.quality;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.port.AnalysisRouteObserver;

@Component
@ConditionalOnProperty(prefix = "career-form.quality", name = "enabled", havingValue = "true")
public final class QualityRouteObserver implements AnalysisRouteObserver {

    @Override
    public void selected(Decision decision) {
        QualityScope.record(decision);
    }
}
