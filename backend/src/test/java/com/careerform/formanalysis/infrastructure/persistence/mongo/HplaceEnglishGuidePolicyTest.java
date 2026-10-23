package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import java.util.List;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.policy.*;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;

class HplaceEnglishGuidePolicyTest {
    // Canonical output of the exact live-derived applicant/address fixture in
    // AutofillWorkflow.hplace-run2.test.tsx; no applicant/profile values travel here.
    @ParameterizedTest
    @CsvSource({"givenFirst,ENGLISH_FULL_NAME_GIVEN_FIRST", "familyFirst,ENGLISH_FULL_NAME_FAMILY_FIRST"})
    void mapsOnlyTheOwnedGuideCanonicalName(String order, String recipe) throws Exception {
        var mapper = new ObjectMapper();
        var request = mapper.readValue("""
            {"schemaVersion":2,"snapshotId":"live-derived","site":{"host":"synthetic.recruiter.im","pathPattern":"/mrs2/applicant/resume/writeResume"},"sections":[{"sectionId":"hplace-detail-basic","fields":[
            {"candidateId":"english","domId":"hplace.detail.englishName.%s","domName":"hplace.detail.englishName.%s","element":"input","control":"text","visibility":"visible"},
            {"candidateId":"birthday","domId":"hplace.detail.birthday","domName":"hplace.detail.birthday","element":"input","control":"text","visibility":"visible"},
            {"candidateId":"detail","domId":"hplace.detail.detailAddress","domName":"hplace.detail.detailAddress","element":"input","control":"text","visibility":"visible"}]}]}
            """.formatted(order,order), FieldsAnalysisRequest.class);
        var d = HplaceCompanyFormPolicyFactory.createNative();
        var policy = CompanyFormPolicy.create(d.companyKey(),d.version(),d.preparationFingerprint(),d.fieldsFingerprint(),d.actionRules(),d.fieldRules(),d.sectionContracts(),d.executionPolicy(),new SupportedProfileFields()::contains);
        assertThat(new HplaceFormFingerprint().matches(policy, request)).isTrue();
        var result = new StoredPolicyFieldMappingResolver(policy,true).resolve(request).results().getFirst();
        assertThat(result).isInstanceOf(FieldMappingResolver.Match.class);
        assertThat(((FieldMappingResolver.Match) result).valueBinding()).isEqualTo(new FieldMappingResolver.DerivedBinding(FieldMappingResolver.DerivedRecipe.valueOf(recipe)));
        var unknown = mapper.writeValueAsString(request).replace("englishName."+order,"englishName.unknown");
        assertThat(new HplaceFormFingerprint().matches(policy,mapper.readValue(unknown,FieldsAnalysisRequest.class))).isFalse();
        var fields = new java.util.ArrayList<>(request.sections().getFirst().fields());
        fields.add(mapper.readValue(mapper.writeValueAsString(fields.getFirst()).replace("\"english\"","\"duplicate\"").replace(order,order.equals("givenFirst")?"familyFirst":"givenFirst"),FieldsAnalysisRequest.FieldCandidate.class));
        var duplicate = new FieldsAnalysisRequest(2,"live-derived",request.site(),List.of(new FieldsAnalysisRequest.Section("hplace-detail-basic",null,null,fields,null)));
        assertThat(new HplaceFormFingerprint().matches(policy,duplicate)).isFalse();
    }
}
