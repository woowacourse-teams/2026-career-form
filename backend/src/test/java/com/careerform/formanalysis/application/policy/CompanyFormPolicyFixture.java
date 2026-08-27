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
                    "applyContentAcademic",
                    "applyContentCareer",
                    "applyContentLicense",
                    "applyContentLinguistics"
                ),
                List.of(
                    actionStructure("btnAddEducationUniv"),
                    actionStructure("btnAddCareer"),
                    actionStructure("btnAddCert"),
                    actionStructure("btnAddLangExam")
                )
            ),
            new FieldsFingerprint(
                Set.of("applyContentUserInfo", "applyContentAcademic"),
                List.of(
                    textStructure("prsApplicantName"),
                    textStructure("prsEngFirstName"),
                    textStructure("prsEngLastName"),
                    textStructure("prsEmail"),
                    textStructure("prsPhone"),
                    selectStructure("prsNationality"),
                    textStructure("prsZipCode"),
                    textStructure("prsAddress"),
                    textStructure("prsAddressDtl"),
                    textStructure("eduhgEducationName"),
                    textStructure("eduEducationName"),
                    selectStructure("eduEducationStatus")
                )
            ),
            List.of(
                addRule("btnAddEducationUniv"),
                addRule("btnAddCareer"),
                addRule("btnAddCert"),
                addRule("btnAddLangExam")
            ),
            List.of(
                textRule("prsEngFirstName", "personal.personal.englishGivenName"),
                textRule("prsEngLastName", "personal.personal.englishFamilyName"),
                textRule("prsEmail", "contact.contact.email"),
                textRule("prsPhone", "contact.contact.phoneNumber"),
                selectRule("prsNationality", "personal.personal.nationality"),
                textRule("prsZipCode", "contact.contact.postalCode"),
                textRule("prsAddress", "contact.contact.addressLine1"),
                textRule("prsAddressDtl", "contact.contact.addressLine2"),
                textRule("eduhgEducationName", "education.highSchool.schoolName"),
                textRule("eduEducationName", "education.university.schoolName"),
                selectRule(
                    "eduEducationStatus",
                    "education.university.completionStatus"
                )
            ),
            supported::contains
        );
    }

    private static ActionRule addRule(String name) {
        return new ActionRule(name, ActionKind.ADD, null);
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

    private static FieldStructure selectStructure(String name) {
        return new FieldStructure(
            name,
            FieldsAnalysisRequest.FormElement.SELECT,
            FieldsAnalysisRequest.FormControl.SELECT
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

    private static FieldRule selectRule(String name, String profileFieldKey) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.SELECT,
            FieldsAnalysisRequest.FormControl.SELECT,
            profileFieldKey
        );
    }
}
