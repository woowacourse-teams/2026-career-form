package com.careerform.formanalysis.infrastructure;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.EnvironmentPostProcessor;
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
        properties.put("spring.ai.model.chat", openai ? "openai" : "none");
        properties.put("spring.ai.chat.client.enabled", openai);
        properties.put("spring.ai.model.embedding", "none");
        properties.put("spring.ai.model.image", "none");
        properties.put("spring.ai.model.audio.transcription", "none");
        properties.put("spring.ai.model.audio.speech", "none");
        properties.put("spring.ai.model.moderation", "none");
        properties.put("spring.ai.openai.max-retries", 0);
        properties.put("spring.ai.openai.timeout", "8s");
        environment.getPropertySources().addFirst(new MapPropertySource("analysisProvider", properties));
    }
}
