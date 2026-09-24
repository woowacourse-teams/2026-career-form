package com.careerform.formanalysis.infrastructure;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.convert.DurationStyle;
import org.springframework.boot.SpringApplication;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
public final class AnalysisProviderEnvironment implements EnvironmentPostProcessor, Ordered {
    @Override
    public int getOrder() { return Ordered.LOWEST_PRECEDENCE; }
    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        var selected = AnalysisProviderSelection.from(environment);
        Map<String, Object> properties = new LinkedHashMap<>();
        boolean openai = selected.enabled() && selected.provider().equals("openai");
        if (openai) {
            validateOpenAiTimeout(environment);
        }
        properties.put("spring.ai.model.chat", openai ? "openai" : "none");
        properties.put("spring.ai.chat.client.enabled", openai);
        properties.put("spring.ai.model.embedding", "none");
        properties.put("spring.ai.model.image", "none");
        properties.put("spring.ai.model.audio.transcription", "none");
        properties.put("spring.ai.model.audio.speech", "none");
        properties.put("spring.ai.model.moderation", "none");
        properties.put("spring.ai.openai.max-retries", 0);
        environment.getPropertySources().addFirst(new MapPropertySource("analysisProvider", properties));
    }

    private static void validateOpenAiTimeout(ConfigurableEnvironment environment) {
        try {
            Duration timeout = DurationStyle.detectAndParse(
                environment.getProperty("spring.ai.openai.timeout")
            );
            if (timeout.isZero() || timeout.isNegative() || !timeout.minusSeconds(60).isNegative()) {
                throw new IllegalArgumentException();
            }
        } catch (RuntimeException exception) {
            throw new IllegalStateException("Invalid OpenAI analysis timeout");
        }
    }
}
