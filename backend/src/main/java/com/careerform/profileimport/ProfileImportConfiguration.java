package com.careerform.profileimport;

import java.net.URI;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiChoiceModel;
import com.careerform.monitoring.ExternalCallMetrics;
import com.careerform.monitoring.tracing.LangSmithTraceRecorder;

/**
 * 폼 분석 공급자 선택(career-form.analysis.*)과 무관하게 OpenAI 키가 있으면 켜진다. 키가 없으면 API는
 * PROFILE_IMPORT_NOT_CONFIGURED를 돌려준다. 키와 모델은 기존 OPENAI_API_KEY, CAREER_FORM_LLM_MODEL을 쓴다.
 */
@Configuration(proxyBeanMethods = false)
class ProfileImportConfiguration {

    @Bean
    ProfileImportService profileImportService(
        @Value("${career-form.profile-import.openai.api-key:}") String apiKey,
        @Value("${career-form.profile-import.openai.endpoint:https://api.openai.com/v1/chat/completions}") URI endpoint,
        @Value("${career-form.profile-import.openai.model:gpt-5.6-luna}") String model,
        @Value("${career-form.profile-import.openai.reasoning-effort:none}") String reasoningEffort,
        @Value("${career-form.profile-import.openai.timeout-ms:60000}") int timeoutMs,
        @Value("${career-form.profile-import.openai.max-output-tokens:8192}") int maxOutputTokens,
        @Value("${career-form.profile-import.max-chars:20000}") int maxChars,
        ObjectProvider<ExternalCallMetrics> metrics,
        ObjectProvider<LangSmithTraceRecorder> traces
    ) {
        var schema = new ProfileDraftSchema();
        var extraction = apiKey == null || apiKey.isBlank() ? null : new ResumeExtractionModel(
            OpenAiChoiceModel.http(endpoint, apiKey, timeoutMs), model, reasoningEffort, maxOutputTokens, schema);
        return new ProfileImportService(extraction, schema, maxChars, model, metrics.getIfAvailable(),
            traces.getIfAvailable());
    }
}
