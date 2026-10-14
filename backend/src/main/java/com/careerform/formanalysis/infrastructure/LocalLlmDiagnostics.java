package com.careerform.formanalysis.infrastructure;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Local-only call metadata. Never logs prompts, responses, or credentials. */
@Component
@Profile("local")
public final class LocalLlmDiagnostics {
    private static final Logger log = LoggerFactory.getLogger(LocalLlmDiagnostics.class);

    public void start(String provider, String stage) {
        log.info("LOCAL_LLM event=call_start provider={} stage={}", provider, stage);
    }

    public void end(String provider, boolean called, long startedAt, RuntimeException failure) {
        log.info("LOCAL_LLM event=call_end provider={} called={} outcome={} durationMs={} failure={}",
            provider, called, failure == null ? "success" : "failure",
            (System.nanoTime() - startedAt) / 1_000_000,
            failure == null ? "none" : failure.getClass().getSimpleName());
    }
}
