package com.careerform.formanalysis.application.port;

import com.careerform.formanalysis.application.FormAnalysisRouter.RouteKind;

@FunctionalInterface
public interface AnalysisRouteObserver {

    void selected(Decision decision);

    enum Operation {
        PREPARATION,
        FIELDS,
        INTERACTION
    }

    record Decision(Operation operation, RouteKind kind, boolean greeting, String companyKey, Long policyVersion) {
    }
}
