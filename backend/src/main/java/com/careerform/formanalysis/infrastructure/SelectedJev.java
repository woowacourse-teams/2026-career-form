package com.careerform.formanalysis.infrastructure;
import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;
public final class SelectedJev implements Condition {
    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        var selected = AnalysisProviderSelection.from(context.getEnvironment());
        return selected.enabled() && selected.provider().equals("jev");
    }
}
