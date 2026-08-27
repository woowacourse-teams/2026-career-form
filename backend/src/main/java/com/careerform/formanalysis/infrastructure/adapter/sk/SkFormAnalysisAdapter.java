package com.careerform.formanalysis.infrastructure.adapter.sk;

import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.CompanyFormAnalysisAdapter;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

@Component
public final class SkFormAnalysisAdapter implements CompanyFormAnalysisAdapter {

    private final SkStructureFingerprint fingerprint = new SkStructureFingerprint();
    private final ActionResolver actionResolver = new SkActionResolver();
    private final FieldMappingResolver fieldMappingResolver =
        new SkFieldMappingResolver();

    @Override
    public boolean isCandidate(PreparationAnalysisRequest request) {
        return fingerprint.isCandidate(request);
    }

    @Override
    public boolean isCandidate(FieldsAnalysisRequest request) {
        return fingerprint.isCandidate(request);
    }

    @Override
    public boolean matchesFingerprint(PreparationAnalysisRequest request) {
        return fingerprint.matches(request);
    }

    @Override
    public boolean matchesFingerprint(FieldsAnalysisRequest request) {
        return fingerprint.matches(request);
    }

    @Override
    public ActionResolver actionResolver() {
        return actionResolver;
    }

    @Override
    public FieldMappingResolver fieldMappingResolver() {
        return fieldMappingResolver;
    }
}
