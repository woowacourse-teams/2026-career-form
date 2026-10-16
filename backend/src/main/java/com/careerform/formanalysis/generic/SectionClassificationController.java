package com.careerform.formanalysis.generic;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@RestController
public final class SectionClassificationController {

    private final SectionClassificationService service;

    public SectionClassificationController(SectionClassificationService service) {
        this.service = service;
    }

    @PostMapping("/api/v1/generic/sections/classify")
    public SectionClassificationResponse classify(@Valid @RequestBody SectionClassificationRequest request) {
        return service.classify(request);
    }
}
