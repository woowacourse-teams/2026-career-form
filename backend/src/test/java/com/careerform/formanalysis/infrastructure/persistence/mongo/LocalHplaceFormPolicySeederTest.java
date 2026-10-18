package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class LocalHplaceFormPolicySeederTest {
    @Test
    void preservesExistingPolicyDocumentsOnRestart() {
        var policies = mock(FormAnalysisPolicyMongoRepository.class);
        when(policies.findByCompanyKeyAndVersion(any(), anyLong()))
            .thenReturn(Optional.of(HplaceCompanyFormPolicyFactory.create()));
        new LocalHplaceFormPolicySeeder(policies).run(null);
        verify(policies, never()).save(any());
        verify(policies, never()).insert(any(FormAnalysisPolicyDocument.class));
    }
}
