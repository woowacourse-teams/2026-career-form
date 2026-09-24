package com.careerform.formanalysis.infrastructure.adapter.openai;

import java.time.Duration;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.observation.ObservationRegistry;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.observation.ChatModelObservationConvention;
import org.springframework.ai.model.openai.autoconfigure.OpenAiChatAutoConfiguration;
import org.springframework.ai.model.openai.autoconfigure.OpenAiChatProperties;
import org.springframework.ai.model.openai.autoconfigure.OpenAiCommonProperties;
import org.springframework.ai.model.tool.ToolCallingManager;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.http.okhttp.OpenAiHttpClientBuilderCustomizer;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;

import com.careerform.formanalysis.infrastructure.SelectedOpenAi;

@Configuration(proxyBeanMethods = false)
@Conditional(SelectedOpenAi.class)
final class OpenAiInteractionChatClientConfiguration {

    static final String INTERACTION_CHAT_CLIENT = "interactionChatClient";

    @Bean(INTERACTION_CHAT_CLIENT)
    ChatClient interactionChatClient(
        OpenAiCommonProperties commonProperties,
        OpenAiChatProperties chatProperties,
        ToolCallingManager toolCallingManager,
        ObjectProvider<ObservationRegistry> observationRegistry,
        ObjectProvider<MeterRegistry> meterRegistry,
        ObjectProvider<ChatModelObservationConvention> observationConvention,
        ObjectProvider<OpenAiHttpClientBuilderCustomizer> httpClientCustomizers
    ) {
        OpenAiChatProperties interactionProperties = copy(chatProperties);
        interactionProperties.setTimeout(Duration.ofSeconds(8));
        interactionProperties.setMaxRetries(0);
        OpenAiChatModel interactionModel = new OpenAiChatAutoConfiguration()
            .openAiChatModel(
                commonProperties,
                interactionProperties,
                toolCallingManager,
                observationRegistry,
                meterRegistry,
                observationConvention,
                httpClientCustomizers
            );
        return ChatClient.create(interactionModel);
    }

    private static OpenAiChatProperties copy(OpenAiChatProperties source) {
        OpenAiChatProperties target = new OpenAiChatProperties();
        target.setBaseUrl(source.getBaseUrl());
        target.setApiKey(source.getApiKey());
        target.setCredential(source.getCredential());
        target.setMicrosoftDeploymentName(source.getMicrosoftDeploymentName());
        target.setDeploymentName(source.getDeploymentName());
        target.setMicrosoftFoundryServiceVersion(
            source.getMicrosoftFoundryServiceVersion()
        );
        target.setOrganizationId(source.getOrganizationId());
        target.setMicrosoftFoundry(source.isMicrosoftFoundry());
        target.setGitHubModels(source.isGitHubModels());
        target.setProxy(source.getProxy());
        target.setCustomHeaders(source.getCustomHeaders());
        target.setConnectionPoolMetricsEnabled(source.isConnectionPoolMetricsEnabled());
        target.setModel(source.getModel());
        target.setFrequencyPenalty(source.getFrequencyPenalty());
        target.setLogitBias(source.getLogitBias());
        target.setLogprobs(source.getLogprobs());
        target.setTopLogprobs(source.getTopLogprobs());
        target.setMaxTokens(source.getMaxTokens());
        target.setMaxCompletionTokens(source.getMaxCompletionTokens());
        target.setN(source.getN());
        target.setOutputModalities(source.getOutputModalities());
        target.setOutputAudio(source.getOutputAudio());
        target.setPresencePenalty(source.getPresencePenalty());
        target.setResponseFormat(source.getResponseFormat());
        target.setStreamOptions(source.getStreamOptions());
        target.setSeed(source.getSeed());
        target.setStop(source.getStop());
        target.setTemperature(source.getTemperature());
        target.setTopP(source.getTopP());
        target.setToolChoice(source.getToolChoice());
        target.setUser(source.getUser());
        target.setParallelToolCalls(source.getParallelToolCalls());
        target.setStore(source.getStore());
        target.setMetadata(source.getMetadata());
        target.setReasoningEffort(source.getReasoningEffort());
        target.setVerbosity(source.getVerbosity());
        target.setServiceTier(source.getServiceTier());
        target.setPromptCacheKey(source.getPromptCacheKey());
        target.setExtraBody(source.getExtraBody());
        return target;
    }
}
