package com.careerform.formanalysis.api;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.application.PreparationAnalysisService;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

class PreparationAnalysisControllerCapabilitiesTest {

    @Test
    void acceptsExactCommaSeparatedCapabilities() {
        PreparationAnalysisService service = mock(PreparationAnalysisService.class);
        PreparationAnalysisRequest request = mock(PreparationAnalysisRequest.class);
        PreparationAnalysisController controller = new PreparationAnalysisController(service);

        controller.analyze(request, "address-search-v1, routing-context-v1, greeting-adapter-v1");

        verify(service).analyze(request, true, true, true);
    }

    @Test
    void doesNotInferCapabilitiesFromSimilarNames() {
        PreparationAnalysisService service = mock(PreparationAnalysisService.class);
        PreparationAnalysisRequest request = mock(PreparationAnalysisRequest.class);

        new PreparationAnalysisController(service).analyze(
            request, "address-search-v1-extra,routing-context-v10,greeting-adapter-v10"
        );

        verify(service).analyze(request, false, false, false);
    }
}
