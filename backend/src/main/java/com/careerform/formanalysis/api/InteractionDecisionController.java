package com.careerform.formanalysis.api;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.careerform.formanalysis.application.InteractionDecisionService;
import com.careerform.formanalysis.dto.InteractionDecisionRequest;
import com.careerform.formanalysis.dto.InteractionDecisionResponse;

import jakarta.validation.Valid;

@RestController
public final class InteractionDecisionController {

    private final InteractionDecisionService service;

    public InteractionDecisionController(InteractionDecisionService service) {
        this.service = service;
    }

    @PostMapping("/api/v1/generic/interaction-decisions")
    public InteractionDecisionResponse decide(
        @Valid @RequestBody InteractionDecisionRequest request
    ) {
        return service.decide(request);
    }
}
