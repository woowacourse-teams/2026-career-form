package com.careerform.formanalysis.infrastructure;
import java.util.Locale;
import org.springframework.core.env.Environment;
public record AnalysisProviderSelection(boolean enabled, String provider) {
    public static AnalysisProviderSelection from(Environment environment) {
        Boolean modern = flag(environment.getProperty("career-form.analysis.enabled"));
        Boolean legacy = flag(environment.getProperty("career-form.llm.enabled"));
        if (modern != null && legacy != null && !modern.equals(legacy))
            throw new IllegalStateException("Conflicting analysis enable settings");
        boolean enabled = modern != null ? modern : Boolean.TRUE.equals(legacy);
        String provider = environment.getProperty("career-form.analysis.provider", "openai").trim().toLowerCase(Locale.ROOT);
        if (!provider.equals("openai") && !provider.equals("jev"))
            throw new IllegalStateException("Unsupported analysis provider");
        return new AnalysisProviderSelection(enabled, provider);
    }
    private static Boolean flag(String value) {
        if (value == null || value.isBlank()) return null;
        if ("true".equalsIgnoreCase(value)) return true;
        if ("false".equalsIgnoreCase(value)) return false;
        throw new IllegalStateException("Analysis enabled must be true or false");
    }
}
