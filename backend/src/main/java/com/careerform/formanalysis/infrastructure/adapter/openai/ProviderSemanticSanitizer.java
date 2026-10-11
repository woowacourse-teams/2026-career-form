package com.careerform.formanalysis.infrastructure.adapter.openai;
/** Compatibility facade for existing OpenAI input records. */
final class ProviderSemanticSanitizer {
    private ProviderSemanticSanitizer() {}
    static String sanitize(String value) {
        return com.careerform.formanalysis.infrastructure.adapter.ProviderSemanticSanitizer.sanitize(value);
    }
}
