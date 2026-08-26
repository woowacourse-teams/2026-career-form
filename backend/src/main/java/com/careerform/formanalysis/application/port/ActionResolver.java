package com.careerform.formanalysis.application.port;

import com.careerform.formanalysis.domain.ActionResolution;
import com.careerform.formanalysis.domain.PreparationSnapshot;

public interface ActionResolver {
    ActionResolution resolve(PreparationSnapshot snapshot);
}
