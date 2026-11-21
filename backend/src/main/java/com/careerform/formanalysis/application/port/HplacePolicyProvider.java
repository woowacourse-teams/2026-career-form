package com.careerform.formanalysis.application.port;

public interface HplacePolicyProvider {

    CompanyFormPolicyProvider.LookupResult find();

    /**
     * Policy for the v1 applicant app resume form, kept apart from the stored MRS2 documents.
     * Providers without one keep the page closed.
     */
    default CompanyFormPolicyProvider.LookupResult findV1ResumeForm() {
        return new CompanyFormPolicyProvider.Unavailable();
    }
}
