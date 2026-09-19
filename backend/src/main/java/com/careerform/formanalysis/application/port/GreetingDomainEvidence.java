package com.careerform.formanalysis.application.port;

public interface GreetingDomainEvidence {

    Decision classify(String host, String pathPattern);

    enum Decision {
        OUT_OF_SCOPE,
        POSITIVE,
        POSITIVE_STABLE,
        NO_POSITIVE_EVIDENCE,
        RETRYABLE_FAILURE
    }
}
