package com.careerform.formanalysis.infrastructure.llm;

public interface LlmStructuredOutputClient {

    <O> O generate(
        String systemPrompt,
        Object input,
        Class<O> outputType,
        String outputSchema
    );
}
