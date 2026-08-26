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

    public static String actionOutput() {
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
                        "required": ["candidateId", "actionType", "command", "expectedEffect", "targetSectionId"],
                        "properties": {
                          "candidateId": {"type": "string"},
                          "actionType": {"type": "string", "enum": ["ACTION"]},
                          "command": {"type": "string", "enum": ["REVEAL_SECTION"]},
                          "expectedEffect": {"type": "string", "enum": ["TARGET_VISIBLE"]},
                          "targetSectionId": {"type": "string"}
                        }
                      },
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["candidateId", "actionType", "command", "expectedEffect"],
                        "properties": {
                          "candidateId": {"type": "string"},
                          "actionType": {"type": "string", "enum": ["ACTION"]},
                          "command": {"type": "string", "enum": ["ADD_REPEATABLE_GROUP"]},
                          "expectedEffect": {"type": "string", "enum": ["GROUP_COUNT_INCREMENT"]}
                        }
                      },
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["candidateId", "actionType"],
                        "properties": {
                          "candidateId": {"type": "string"},
                          "actionType": {"type": "string", "enum": ["NO_ACTION"]}
                        }
                      }
                    ]
                  }
                }
              }
            }
            """;
    }
}
