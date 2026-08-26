package com.careerform.formanalysis.api;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.careerform.formanalysis.application.FieldsAnalysisService;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;

import jakarta.validation.Valid;

@RestController
public final class FieldsAnalysisController {

    private final FieldsAnalysisService service;

    public FieldsAnalysisController(FieldsAnalysisService service) {
        this.service = service;
    }

    @PostMapping("/api/v1/fields/analyze")
    public FieldsAnalysisResponse analyze(
        @Valid @RequestBody FieldsAnalysisRequest request
    ) {
        return service.analyze(request);
    }
}
