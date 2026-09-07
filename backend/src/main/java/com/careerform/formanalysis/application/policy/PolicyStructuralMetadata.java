package com.careerform.formanalysis.application.policy;

import java.util.Map;
import java.util.Objects;

final class PolicyStructuralMetadata {

    private PolicyStructuralMetadata() {
    }

    static boolean matches(
        String structuralName,
        String domId,
        String domName,
        String displayName
    ) {
        return structuralName.equals(domId)
            || structuralName.equals(domName)
            || structuralName.equals(displayName);
    }

    static <T> T find(
        Map<String, T> values,
        String domId,
        String domName,
        String displayName
    ) {
        String matchedKey = null;
        T matchedValue = null;
        for (String candidateKey : new String[] { domName, domId, displayName }) {
            if (candidateKey == null || !values.containsKey(candidateKey)) {
                continue;
            }
            T candidateValue = values.get(candidateKey);
            if (matchedKey != null && !Objects.equals(matchedValue, candidateValue)) {
                return null;
            }
            matchedKey = candidateKey;
            matchedValue = candidateValue;
        }
        return matchedKey == null ? null : values.get(matchedKey);
    }
}
