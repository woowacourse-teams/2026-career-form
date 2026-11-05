package com.careerform.formanalysis.infrastructure;
import java.util.Locale;
import org.springframework.core.env.Environment;
public record AnalysisProviderSelection(
    boolean enabled,
    String provider,
    String searchProvider,
    String calendarProvider
) {
    public AnalysisProviderSelection(boolean enabled, String provider) {
        this(enabled, provider, provider, provider);
    }
    public AnalysisProviderSelection(boolean enabled, String provider, String searchProvider) {
        this(enabled, provider, searchProvider, provider);
    }
    public boolean uses(String name) {
        return enabled && (provider.equals(name) || searchProvider.equals(name) || calendarProvider.equals(name));
    }
    public boolean splitInteractions() {
        return !provider.equals(searchProvider) || !provider.equals(calendarProvider);
    }
    public static AnalysisProviderSelection from(Environment environment) {
        Boolean modern = flag(environment.getProperty("career-form.analysis.enabled"));
        Boolean legacy = flag(environment.getProperty("career-form.llm.enabled"));
        if (modern != null && legacy != null && !modern.equals(legacy))
            throw new IllegalStateException("Conflicting analysis enable settings");
        boolean enabled = modern != null ? modern : Boolean.TRUE.equals(legacy);
        String provider = environment.getProperty("career-form.analysis.provider", "openai").trim().toLowerCase(Locale.ROOT);
        if (!provider.equals("openai") && !provider.equals("jev"))
            throw new IllegalStateException("Unsupported analysis provider");
        String search = environment.getProperty("career-form.analysis.search-provider", "").trim().toLowerCase(Locale.ROOT);
        if (search.isEmpty()) search = provider;
        if (!search.equals("openai") && !search.equals("jev"))
            throw new IllegalStateException("Unsupported search provider");
        String calendar = environment.getProperty("career-form.analysis.calendar-provider", "").trim()
            .toLowerCase(Locale.ROOT);
        if (calendar.isEmpty()) calendar = provider;
        if (!calendar.equals("openai") && !calendar.equals("jev"))
            throw new IllegalStateException("Unsupported calendar provider");
        return new AnalysisProviderSelection(enabled, provider, search, calendar);
    }
    private static Boolean flag(String value) {
        if (value == null || value.isBlank()) return null;
        if ("true".equalsIgnoreCase(value)) return true;
        if ("false".equalsIgnoreCase(value)) return false;
        throw new IllegalStateException("Analysis enabled must be true or false");
    }
}
