package com.careerform.llm.mapping;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@RestController
@ConditionalOnProperty(
    prefix = "career-form.llm",
    name = "enabled",
    havingValue = "true"
)
final class LlmMappingController {

    private final LlmMappingService service;
    private final LlmRequestLimits requestLimits;

    LlmMappingController(LlmMappingService service, LlmRequestLimits requestLimits) {
        this.service = service;
        this.requestLimits = requestLimits;
    }

    @PostMapping("/api/v1/llm/mappings")
    LlmMappingResponse map(@Valid @RequestBody LlmMappingRequest request) {
        requestLimits.validate(request);
        return service.map(request);
    }
}
