package com.careerform.formanalysis.api;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.careerform.formanalysis.application.FieldsAnalysisService;
import com.careerform.formanalysis.domain.FieldsAnalysis;
import com.careerform.formanalysis.domain.FieldsSnapshot;

import jakarta.validation.Valid;

@RestController
final class FieldsAnalysisController {

    private final FieldsAnalysisService service;

    FieldsAnalysisController(FieldsAnalysisService service) {
        this.service = service;
    }

    @PostMapping("/api/v1/fields/analyze")
    FieldsAnalysis analyze(@Valid @RequestBody FieldsSnapshot snapshot) {
        return service.analyze(snapshot);
    }
}
