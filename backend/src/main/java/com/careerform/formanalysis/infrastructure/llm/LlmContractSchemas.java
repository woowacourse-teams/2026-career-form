package com.careerform.formanalysis.infrastructure.llm;

import java.util.Set;

import tools.jackson.databind.json.JsonMapper;

public final class LlmContractSchemas {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private LlmContractSchemas() {
    }

    public static String fieldOutput(Set<String> allowedKeys) {
        String keyEnum = JSON.writeValueAsString(
            allowedKeys.stream().sorted().toList()
        );
        return """
            {
              "type": "object",
              "additionalProperties": false,
              "required": ["schemaVersion", "snapshotId", "results"],
              "properties": {
                "schemaVersion": {"type": "integer", "enum": [2]},
                "snapshotId": {"type": "string"},
                "results": {
                  "type": "array",
                  "items": {
                    "anyOf": [
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["candidateId", "matchType", "profileFieldKey"],
                        "properties": {
                          "candidateId": {"type": "string"},
                          "matchType": {"type": "string", "enum": ["MATCH"]},
                          "profileFieldKey": {"type": "string", "enum": %s}
                        }
                      },
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["candidateId", "matchType"],
                        "properties": {
                          "candidateId": {"type": "string"},
                          "matchType": {"type": "string", "enum": ["NO_MATCH"]}
                        }
                      }
                    ]
                  }
                }
              }
            }
            """.formatted(keyEnum);
    }
}
