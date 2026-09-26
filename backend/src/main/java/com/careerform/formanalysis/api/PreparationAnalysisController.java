package com.careerform.formanalysis.api;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import com.careerform.formanalysis.application.PreparationAnalysisService;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse;

import jakarta.validation.Valid;

@RestController
public final class PreparationAnalysisController {

    private final PreparationAnalysisService service;

    public PreparationAnalysisController(PreparationAnalysisService service) {
        this.service = service;
    }

    @PostMapping("/api/v1/preparation/analyze")
    public PreparationAnalysisResponse analyze(
        @Valid @RequestBody PreparationAnalysisRequest request,
        @RequestHeader(value = "X-Career-Form-Capabilities", required = false) String capabilities
    ) {
        Set<String> supported = capabilities == null
            ? Set.of()
            : Arrays.stream(capabilities.split(","))
                .map(String::trim)
                .collect(Collectors.toSet());
        return service.analyze(
            request,
            supported.contains("address-search-v1"),
            supported.contains("routing-context-v1"),
            supported.contains("greeting-adapter-v1")
        );
    }
}
