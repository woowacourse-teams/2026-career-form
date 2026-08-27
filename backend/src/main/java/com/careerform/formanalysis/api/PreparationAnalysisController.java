package com.careerform.formanalysis.api;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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
        @Valid @RequestBody PreparationAnalysisRequest request
    ) {
        return service.analyze(request);
    }
}
