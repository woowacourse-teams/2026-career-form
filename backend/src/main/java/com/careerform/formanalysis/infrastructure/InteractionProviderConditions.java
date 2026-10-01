package com.careerform.formanalysis.infrastructure;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;

public final class InteractionProviderConditions {
    private InteractionProviderConditions() {}

    public static final class OpenAiClient implements Condition {
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            return AnalysisProviderSelection.from(context.getEnvironment()).uses("openai");
        }
    }
    public static final class JevClient implements Condition {
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            return AnalysisProviderSelection.from(context.getEnvironment()).uses("jev");
        }
    }
    public static final class OpenAiOnly implements Condition {
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            var selected = AnalysisProviderSelection.from(context.getEnvironment());
            return selected.uses("openai") && !selected.splitInteractions();
        }
    }
    public static final class JevOnly implements Condition {
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            var selected = AnalysisProviderSelection.from(context.getEnvironment());
            return selected.uses("jev") && !selected.splitInteractions();
        }
    }
    public static final class Split implements Condition {
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            var selected = AnalysisProviderSelection.from(context.getEnvironment());
            return selected.enabled() && selected.splitInteractions();
        }
    }
}
