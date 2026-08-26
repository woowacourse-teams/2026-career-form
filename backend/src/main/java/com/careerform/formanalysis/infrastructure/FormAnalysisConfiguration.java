package com.careerform.formanalysis.infrastructure;

import java.util.Optional;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.careerform.formanalysis.api.SnapshotRequestLimits;
import com.careerform.formanalysis.application.ActionResolutionValidator;
import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FieldMappingResolutionValidator;
import com.careerform.formanalysis.application.FieldsAnalysisService;
import com.careerform.formanalysis.application.PreparationAnalysisService;
import com.careerform.formanalysis.application.SnapshotValidator;
import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver;

import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(FormAnalysisProperties.class)
public class FormAnalysisConfiguration {

    @Bean
    SnapshotValidator snapshotValidator() {
        return new SnapshotValidator();
    }

    @Bean
    ActionResolutionValidator actionResolutionValidator() {
        return new ActionResolutionValidator();
    }

    @Bean
    FieldMappingResolutionValidator fieldMappingResolutionValidator() {
        return new FieldMappingResolutionValidator();
    }

    @Bean
    FieldInteractionPolicy fieldInteractionPolicy() {
        return new FieldInteractionPolicy();
    }

    @Bean
    SnapshotRequestLimits snapshotRequestLimits(
        FormAnalysisProperties properties,
        ObjectMapper objectMapper
    ) {
        return new SnapshotRequestLimits(properties.maxRequestBytes(), objectMapper);
    }

    @Bean
    PreparationAnalysisService preparationAnalysisService(
        ObjectProvider<ActionResolver> resolver,
        SnapshotValidator snapshotValidator,
        ActionResolutionValidator resolutionValidator
    ) {
        return new PreparationAnalysisService(
            Optional.ofNullable(resolver.getIfAvailable()),
            snapshotValidator,
            resolutionValidator
        );
    }

    @Bean
    FieldsAnalysisService fieldsAnalysisService(
        ObjectProvider<FieldMappingResolver> resolver,
        SnapshotValidator snapshotValidator,
        FieldMappingResolutionValidator resolutionValidator,
        FieldInteractionPolicy interactionPolicy
    ) {
        return new FieldsAnalysisService(
            Optional.ofNullable(resolver.getIfAvailable()),
            snapshotValidator,
            resolutionValidator,
            interactionPolicy
        );
    }
}
