package com.careerform.formanalysis.application.port;

import com.careerform.formanalysis.domain.FieldMappingResolution;
import com.careerform.formanalysis.domain.FieldsSnapshot;

public interface FieldMappingResolver {
    FieldMappingResolution resolve(FieldsSnapshot snapshot);
}
