package com.careerform.formanalysis.application.port;

public interface GreetingDomainEvidence {
    Decision classify(String host, String pathPattern);

    enum Decision {
        POSITIVE,
        NO_POSITIVE_EVIDENCE,
        RETRYABLE_FAILURE
    }
}
