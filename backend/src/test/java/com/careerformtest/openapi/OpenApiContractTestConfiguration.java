package com.careerformtest.openapi;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@TestConfiguration(proxyBeanMethods = false)
public class OpenApiContractTestConfiguration {

    @Bean
    OpenApiContractController openApiContractController() {
        return new OpenApiContractController();
    }
}

@Validated
@RestController
class OpenApiContractController {

    @PostMapping(
            path = "/__test/openapi-contract",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    OpenApiContractResponse create(
            @RequestParam(name = "count") @Min(1) @Max(100) int count,
            @Valid @RequestBody OpenApiContractRequest request) {
        return new OpenApiContractResponse(UUID.randomUUID(), request.name());
    }
}

record OpenApiContractRequest(
        @NotBlank String name,
        @NotNull LocalDate requestedOn,
        @NotNull Category category) {
}

record OpenApiContractResponse(UUID id, String name) {
}

enum Category {
    TECHNICAL,
    CULTURAL
}
