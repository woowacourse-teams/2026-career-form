package com.careerform.formanalysis.infrastructure.llm.openai;

import org.springframework.ai.converter.StructuredOutputConverter;

import tools.jackson.databind.json.JsonMapper;

final class StrictSchemaOutputConverter<O> implements StructuredOutputConverter<O> {

    private final Class<O> outputType;
    private final JsonMapper jsonMapper;
    private final String jsonSchema;

    StrictSchemaOutputConverter(
        Class<O> outputType,
        JsonMapper jsonMapper,
        String jsonSchema
    ) {
        this.outputType = outputType;
        this.jsonMapper = jsonMapper;
        this.jsonSchema = jsonSchema;
    }

    @Override
    public O convert(String source) {
        return jsonMapper.readValue(source, outputType);
    }

    @Override
    public String getFormat() {
        return "Return only JSON matching the provider schema.";
    }

    @Override
    public String getJsonSchema() {
        return jsonSchema;
    }
}
