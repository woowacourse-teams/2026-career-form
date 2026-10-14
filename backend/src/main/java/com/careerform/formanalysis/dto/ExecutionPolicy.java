package com.careerform.formanalysis.dto;

import java.util.List;

/** Declarative browser operations; no executable scripts are accepted. */
public record ExecutionPolicy(int version, List<SearchRule> searches, List<FailureScope> failureScopes, AddressRule address, java.util.Map<String, Object> browserPolicy, java.util.Map<String, Object> componentPolicy, java.util.Map<String, Object> providerPolicy) {
    public ExecutionPolicy(int version, List<SearchRule> searches, List<FailureScope> failureScopes, AddressRule address, java.util.Map<String,Object> browserPolicy, java.util.Map<String,Object> componentPolicy) {
        this(version, searches, failureScopes, address, browserPolicy, componentPolicy, null);
    }
    public ExecutionPolicy withProvider(java.util.Map<String,Object> provider) { return new ExecutionPolicy(version, searches, failureScopes, address, browserPolicy, componentPolicy, provider); }
    public ExecutionPolicy(int version, List<SearchRule> searches, List<FailureScope> failureScopes, AddressRule address, java.util.Map<String, Object> browserPolicy) {
        this(version, searches, failureScopes, address, browserPolicy, null);
    }
    public static ExecutionPolicy greeting() {
        return new ExecutionPolicy(1, List.of(), List.of(), null, null, loadBrowserPolicy("greeting"));
    }
    public record SearchRule(String fieldName, String profileFieldKey, String rowSelector,
        String catalogKind, int stageOffset, boolean requireResultId, String readySelector,
        boolean standardAliases, boolean stripParentheticalLabel, boolean allowDirectInput,
        int menuTimeoutMs, int readyTimeoutMs) {
        public SearchRule(String fieldName, String profileFieldKey, String rowSelector, String catalogKind,
            int stageOffset, boolean requireResultId, String readySelector) {
            this(fieldName,profileFieldKey,rowSelector,catalogKind,stageOffset,requireResultId,readySelector,
                "languageTest".equals(catalogKind),"languageTest".equals(catalogKind),true,2500,1000);
        }
    }
    public record FailureScope(String fieldName, String profileFieldKey, String rowSelector) {}
    public record AddressRule(String provider, String rootSelector, String triggerSelector,
        List<String> fieldNames, String layerSelector, String closeSelector) {}
    private static java.util.Map<String, Object> loadBrowserPolicy(String name) {
        java.util.Map<String, Object> browserPolicy;
        try (var stream = ExecutionPolicy.class.getResourceAsStream("/policies/" + name + "-browser-v1.json")) {
            browserPolicy = new com.fasterxml.jackson.databind.ObjectMapper().readValue(stream,
                new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>() {});
        } catch (java.io.IOException e) { throw new IllegalStateException("Cannot load initial browser policy", e); }
        return browserPolicy;
    }
    public static ExecutionPolicy hyundai() {
        return new ExecutionPolicy(1, List.of(), List.of(), null, loadBrowserPolicy("hyundai"));
    }
    public static ExecutionPolicy sk() {
        var browserPolicy = loadBrowserPolicy("sk");
        return new ExecutionPolicy(1, List.of(
            new SearchRule("eduEducationName", "education.university.schoolName", ".form-item-group.educationUniv-item", "university", 0, false, ""),
            new SearchRule("cerCertName", "certifications.certificate.name", ".form-item-group.cert-Item", "certificate", 1, false, ""),
            new SearchRule("lngExamName", "languages.languageTest.testName", ".form-item-group.langExam-Item", "languageTest", 2, true, "input[name='lngExamScore'], select[name='lngExamScoreSel']")
        ), List.of(
            new FailureScope("lngLanguageType", "languages.languageTest.language", ".form-item-group.langExam-Item"),
            new FailureScope("eduEducationName", "education.university.schoolName", ".form-item-group.educationUniv-item"),
            new FailureScope("cerCertName", "certifications.certificate.name", ".form-item-group.cert-Item"),
            new FailureScope("lngExamName", "languages.languageTest.testName", ".form-item-group.langExam-Item")
        ), new AddressRule("KAKAO", "#applyContentUserInfo", "#btnSearchAddress",
            List.of("prsZipCode", "prsAddress", "prsAddressDtl"), "#layer", "img#btnCloseLayer"), browserPolicy);
    }
}
