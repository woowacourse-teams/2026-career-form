package com.careerform.formanalysis.api;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.careerform.formanalysis.application.PreparationAnalysisService;
import com.careerform.formanalysis.domain.PreparationAnalysis;
import com.careerform.formanalysis.domain.PreparationSnapshot;

import jakarta.validation.Valid;

@RestController
final class PreparationAnalysisController {

    private final PreparationAnalysisService service;

    PreparationAnalysisController(PreparationAnalysisService service) {
        this.service = service;
    }

    @PostMapping("/api/v1/preparation/analyze")
    PreparationAnalysis analyze(@Valid @RequestBody PreparationSnapshot snapshot) {
        return service.analyze(snapshot);
    }
}
