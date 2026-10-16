package com.careerform.formanalysis.generic;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@RestController
public final class GenericFieldsController {

    private final GenericFieldsService service;

    public GenericFieldsController(GenericFieldsService service) {
        this.service = service;
    }

    @PostMapping("/api/v1/generic/fields/analyze")
    public GenericFieldsResponse analyze(@Valid @RequestBody GenericFieldsRequest request) {
        return service.analyze(request);
    }
}
