package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.util.List;
import java.util.Set;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionKind;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldsFingerprint;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.PreparationFingerprint;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

@Component
@Profile("local")
final class LocalCompanyFormPolicySeeder implements ApplicationRunner {

    private static final String COMPANY_KEY = "sk";
    private static final long VERSION = 1;

    private final FormAnalysisCompanyMongoRepository companies;
    private final FormAnalysisPolicyMongoRepository policies;

    LocalCompanyFormPolicySeeder(
        FormAnalysisCompanyMongoRepository companies,
        FormAnalysisPolicyMongoRepository policies
    ) {
        this.companies = companies;
        this.policies = policies;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        policies.save(policy());
        companies.save(new FormAnalysisCompanyDocument(
            COMPANY_KEY,
            COMPANY_KEY,
            "www.skcareers.com",
            List.of("/Recruit/Apply/"),
            VERSION
        ));
    }

    private static FormAnalysisPolicyDocument policy() {
        return new FormAnalysisPolicyDocument(
            "sk-policy-v1",
            COMPANY_KEY,
            VERSION,
            new PreparationFingerprint(
                Set.of("section-profile", "section-detail", "section-credentials"),
                List.of(
                    actionStructure("detail-toggle"),
                    actionStructure("credential-add")
                )
            ),
            new FieldsFingerprint(
                Set.of("section-profile", "section-education"),
                List.of(
                    textStructure("applicant-family-name"),
                    textStructure("applicant-given-name"),
                    textStructure("applicant-email"),
                    textStructure("applicant-phone"),
                    textStructure("education-school-name"),
                    new FieldStructure(
                        "education-completion-status",
                        FieldsAnalysisRequest.FormElement.SELECT,
                        FieldsAnalysisRequest.FormControl.SELECT
                    )
                )
            ),
            List.of(
                new ActionRule("detail-toggle", ActionKind.REVEAL, "section-detail"),
                new ActionRule("credential-add", ActionKind.ADD, null)
            ),
            List.of(
                textRule("applicant-family-name", "personal.personal.koreanFamilyName"),
                textRule("applicant-given-name", "personal.personal.koreanGivenName"),
                textRule("applicant-email", "contact.contact.email"),
                textRule("applicant-phone", "contact.contact.phoneNumber"),
                textRule("education-school-name", "education.university.schoolName"),
                new FieldRule(
                    "education-completion-status",
                    FieldsAnalysisRequest.FormElement.SELECT,
                    FieldsAnalysisRequest.FormControl.SELECT,
                    "education.university.completionStatus"
                )
            )
        );
    }

    private static ActionStructure actionStructure(String name) {
        return new ActionStructure(
            name,
            PreparationAnalysisRequest.FormElement.BUTTON,
            PreparationAnalysisRequest.FormControl.BUTTON
        );
    }

    private static FieldStructure textStructure(String name) {
        return new FieldStructure(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT
        );
    }

    private static FieldRule textRule(String name, String profileFieldKey) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT,
            profileFieldKey
        );
    }
}
