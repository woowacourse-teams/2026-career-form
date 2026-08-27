package com.careerform.formanalysis.application.policy;

import java.util.List;
import java.util.Set;

import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionKind;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldsFingerprint;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.PreparationFingerprint;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

public final class CompanyFormPolicyFixture {

    private CompanyFormPolicyFixture() {
    }

    public static CompanyFormPolicy sk() {
        SupportedProfileFields supported = new SupportedProfileFields();
        return CompanyFormPolicy.create(
            "sk",
            1,
            new PreparationFingerprint(
                Set.of(
                    "section-profile",
                    "section-detail",
                    "section-credentials"
                ),
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
                new ActionRule(
                    "detail-toggle",
                    ActionKind.REVEAL,
                    "section-detail"
                ),
                new ActionRule("credential-add", ActionKind.ADD, null)
            ),
            List.of(
                textRule(
                    "applicant-family-name",
                    "personal.personal.koreanFamilyName"
                ),
                textRule(
                    "applicant-given-name",
                    "personal.personal.koreanGivenName"
                ),
                textRule("applicant-email", "contact.contact.email"),
                textRule("applicant-phone", "contact.contact.phoneNumber"),
                textRule(
                    "education-school-name",
                    "education.university.schoolName"
                ),
                new FieldRule(
                    "education-completion-status",
                    FieldsAnalysisRequest.FormElement.SELECT,
                    FieldsAnalysisRequest.FormControl.SELECT,
                    "education.university.completionStatus"
                )
            ),
            supported::contains
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
