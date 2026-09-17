package com.careerform.architecture;

import com.careerform.architecture.fixture.allowed.config.AllowedConfig;
import com.careerform.architecture.fixture.allowed.domain.AllowedMongoDomain;
import com.careerform.architecture.fixture.allowed.infrastructure.AllowedSchemaAdapter;
import com.careerform.architecture.fixture.allowed.infrastructure.dto.AllowedProviderDto;
import com.careerform.architecture.fixture.invalid.api.InvalidController;
import com.careerform.architecture.fixture.invalid.api.InvalidRequest;
import com.careerform.architecture.fixture.invalid.api.InvalidResponse;
import com.careerform.architecture.fixture.invalid.application.InvalidApplicationInput;
import com.careerform.architecture.fixture.invalid.application.InvalidProviderService;
import com.careerform.architecture.fixture.invalid.application.cyclealpha.AlphaService;
import com.careerform.architecture.fixture.invalid.application.cyclebeta.BetaService;
import com.careerform.architecture.fixture.invalid.application.port.InvalidProviderPort;
import com.careerform.architecture.fixture.invalid.domain.InvalidDomain;
import com.careerform.architecture.fixture.invalid.domain.InvalidRepositoryDomain;
import com.careerform.architecture.fixture.invalid.dto.InvalidLegacyResponse;
import com.careerform.architecture.fixture.invalid.infrastructure.InvalidAdapter;
import com.careerform.architecture.fixture.invalid.infrastructure.ProviderResponse;
import com.careerform.architecture.fixture.valid.api.ValidController;
import com.careerform.architecture.fixture.valid.api.ValidRequest;
import com.careerform.architecture.fixture.valid.api.ValidResponse;
import com.careerform.architecture.fixture.valid.application.ValidInput;
import com.careerform.architecture.fixture.valid.application.ValidResult;
import com.careerform.architecture.fixture.valid.application.ValidService;
import com.careerform.architecture.fixture.valid.application.ValidDtoConsumer;
import com.careerform.architecture.fixture.valid.application.dto.ValidApplicationDto;
import com.careerform.architecture.fixture.valid.application.port.ValidPort;
import com.careerform.architecture.fixture.valid.infrastructure.ValidAdapter;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.EvaluationResult;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BackendArchitectureRulesTest {

    @Test
    void valid_layered_types_pass_every_rule() {
        JavaClasses classes = importClasses(
                ValidController.class,
                ValidRequest.class,
                ValidResponse.class,
                ValidInput.class,
                ValidResult.class,
                ValidService.class,
                ValidPort.class,
                ValidAdapter.class);

        for (BackendArchitectureRule rule : BackendArchitectureRules.all()) {
            assertThat(rule.rule().evaluate(classes).getFailureReport().getDetails())
                    .as(rule.id())
                    .isEmpty();
        }
    }

    @Test
    void application_input_using_nested_api_type_is_rejected() {
        assertViolation("A1", InvalidApplicationInput.class, InvalidRequest.class);
    }

    @Test
    void application_can_use_its_own_dto() {
        assertNoViolation("A1", ValidDtoConsumer.class, ValidApplicationDto.class);
    }

    @Test
    void adapter_can_own_provider_dto() {
        assertNoViolation("A1", AllowedProviderDto.class);
    }

    @Test
    void controller_using_concrete_adapter_is_rejected() {
        assertViolation("A2", InvalidController.class, InvalidAdapter.class);
    }

    @Test
    void service_using_provider_sdk_is_rejected() {
        assertViolation("A2", InvalidProviderService.class);
    }

    @Test
    void domain_using_application_type_is_rejected() {
        assertViolation("A3", InvalidDomain.class, InvalidApplicationInput.class);
    }

    @Test
    void domain_can_use_allowed_mongo_mapping_annotations() {
        assertNoViolation("A3", AllowedMongoDomain.class);
    }

    @Test
    void domain_using_spring_data_repository_is_rejected() {
        assertViolation("A3", InvalidRepositoryDomain.class);
    }

    @Test
    void port_exposing_provider_type_is_rejected() {
        assertViolation("A4", InvalidProviderPort.class, ProviderResponse.class);
    }

    @Test
    void feature_cycle_is_rejected() {
        assertViolation("A5", AlphaService.class, BetaService.class);
    }

    @Test
    void response_containing_application_result_is_rejected() {
        assertViolation("A6", InvalidResponse.class, ValidResult.class);
    }

    @Test
    void legacy_api_response_containing_application_result_is_rejected() {
        assertViolation("A6", InvalidLegacyResponse.class, ValidResult.class);
    }

    @Test
    void configuration_wiring_is_allowed() {
        assertNoViolation("A2", AllowedConfig.class, ValidService.class, ValidAdapter.class);
    }

    @Test
    void adapter_reading_supported_profile_keys_is_allowed() {
        assertNoViolation(
                "A4",
                AllowedSchemaAdapter.class,
                SupportedProfileFields.class,
                ValidPort.class);
    }

    @Test
    void response_factory_accepting_application_result_is_allowed() {
        assertNoViolation("A6", ValidResponse.class, ValidResult.class);
    }

    private static void assertViolation(String id, Class<?>... classes) {
        assertThat(evaluate(id, classes).getFailureReport().getDetails()).isNotEmpty();
    }

    private static void assertNoViolation(String id, Class<?>... classes) {
        assertThat(evaluate(id, classes).getFailureReport().getDetails()).isEmpty();
    }

    private static EvaluationResult evaluate(String id, Class<?>... classes) {
        return BackendArchitectureRules.all().stream()
                .filter(rule -> rule.id().equals(id))
                .findFirst()
                .orElseThrow()
                .rule()
                .evaluate(importClasses(classes));
    }

    private static JavaClasses importClasses(Class<?>... classes) {
        return new ClassFileImporter().importClasses(classes);
    }
}
