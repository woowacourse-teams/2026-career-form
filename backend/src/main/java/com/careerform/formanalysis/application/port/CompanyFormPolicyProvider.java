package com.careerform.formanalysis.application.port;

import java.util.Objects;

import com.careerform.formanalysis.application.policy.CompanyFormPolicy;

public interface CompanyFormPolicyProvider {

    LookupResult find(String host, String pathPattern);

    sealed interface LookupResult permits NotRegistered, Available, Unavailable {
    }

    record NotRegistered() implements LookupResult {
    }

    record Available(CompanyFormPolicy policy) implements LookupResult {

        public Available {
            Objects.requireNonNull(policy);
        }
    }

    record Unavailable() implements LookupResult {
    }
}
