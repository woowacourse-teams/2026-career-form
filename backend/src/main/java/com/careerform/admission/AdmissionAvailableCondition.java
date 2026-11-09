package com.careerform.admission;

import org.springframework.boot.autoconfigure.condition.AnyNestedCondition;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

public final class AdmissionAvailableCondition extends AnyNestedCondition {
    public AdmissionAvailableCondition() { super(ConfigurationPhase.REGISTER_BEAN); }
    @ConditionalOnProperty(prefix = "career-form.admission", name = "enabled", havingValue = "true")
    static class Enabled { }
    @ConditionalOnProperty(prefix = "career-form.admission", name = "registration-enabled", havingValue = "true")
    static class Registration { }
}
