package com.careerform.formanalysis.application.port;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

public interface CompanyFormAnalysisAdapter {

    boolean isCandidate(PreparationAnalysisRequest request);

    boolean isCandidate(FieldsAnalysisRequest request);

    boolean matchesFingerprint(PreparationAnalysisRequest request);

    boolean matchesFingerprint(FieldsAnalysisRequest request);

    ActionResolver actionResolver();

    FieldMappingResolver fieldMappingResolver();
}
