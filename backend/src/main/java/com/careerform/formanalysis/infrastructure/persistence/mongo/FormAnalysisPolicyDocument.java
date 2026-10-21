package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.util.List;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldsFingerprint;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.PreparationFingerprint;

@Document("form_analysis_policies")
@CompoundIndex(
    name = "company_version_unique",
    def = "{'companyKey': 1, 'version': 1}",
    unique = true
)
public record FormAnalysisPolicyDocument(
    @Id String id,
    String companyKey,
    long version,
    PreparationFingerprint preparationFingerprint,
    FieldsFingerprint fieldsFingerprint,
    List<ActionRule> actionRules,
    List<FieldRule> fieldRules,
    com.careerform.formanalysis.dto.ExecutionPolicy executionPolicy,
    List<com.careerform.formanalysis.application.policy.SectionContract> sectionContracts
) {

    public FormAnalysisPolicyDocument(String id, String companyKey, long version,
        PreparationFingerprint preparationFingerprint, FieldsFingerprint fieldsFingerprint,
        List<ActionRule> actionRules, List<FieldRule> fieldRules, com.careerform.formanalysis.dto.ExecutionPolicy executionPolicy) {
        this(id, companyKey, version, preparationFingerprint, fieldsFingerprint, actionRules, fieldRules, executionPolicy, List.of());
    }
    public FormAnalysisPolicyDocument(String id, String companyKey, long version,
        PreparationFingerprint preparationFingerprint, FieldsFingerprint fieldsFingerprint,
        List<ActionRule> actionRules, List<FieldRule> fieldRules) {
        this(id, companyKey, version, preparationFingerprint, fieldsFingerprint, actionRules, fieldRules, null);
    }
    public FormAnalysisPolicyDocument withExecutionPolicy(com.careerform.formanalysis.dto.ExecutionPolicy policy) {
        return new FormAnalysisPolicyDocument(id, companyKey, version, preparationFingerprint, fieldsFingerprint, actionRules, fieldRules, policy, sectionContracts);
    }

    public FormAnalysisPolicyDocument {
        sectionContracts = sectionContracts == null ? List.of() : List.copyOf(sectionContracts);
        actionRules = actionRules == null ? null : List.copyOf(actionRules);
        fieldRules = fieldRules == null ? null : List.copyOf(fieldRules);
    }
}
