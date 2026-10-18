package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Available;
import com.careerform.formanalysis.application.port.FieldMappingResolver.ValueBinding;

class HplaceNativePolicyTest {
    @Test void loadsVersionFourWithSectionContractsAndHanjaRecipe() throws Exception {
        var source = getClass().getResourceAsStream("/policies/hplace-mrs2-v4.json");
        assertThat(source).as("new insert-only native policy resource").isNotNull();
        var json = new ObjectMapper().readTree(source);
        assertThat(json.path("version").asInt()).isEqualTo(4);
        assertThat(json.path("sectionContracts").size()).isGreaterThanOrEqualTo(4);
    }
    @Test void roundTripsHanjaNameAsADerivedBinding() throws Exception {
        var mapper = new ObjectMapper();
        var binding = mapper.readValue("{\"type\":\"DERIVED\",\"recipe\":\"HANJA_FULL_NAME\"}", ValueBinding.class);
        assertThat(mapper.readTree(mapper.writeValueAsString(binding)).path("recipe").asText()).isEqualTo("HANJA_FULL_NAME");
    }
    private com.careerform.formanalysis.application.FieldsAnalysisService service(FormAnalysisPolicyDocument document) {
        var repository = mock(FormAnalysisPolicyMongoRepository.class);
        when(repository.findByCompanyKeyAndVersion("hplace",4)).thenReturn(Optional.of(document));
        var router = new com.careerform.formanalysis.application.FormAnalysisRouter((h,p)->new com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.NotRegistered(),
            (h,p)->{throw new AssertionError("DNS fallback");}, com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Unavailable::new,
            new MongoHplacePolicyProvider(repository,new SupportedProfileFields(),4));
        return new com.careerform.formanalysis.application.FieldsAnalysisService(Optional.empty(),router,
            new com.careerform.formanalysis.application.FieldInteractionPolicy(),new SupportedProfileFields());
    }
    private com.careerform.formanalysis.dto.FieldsAnalysisRequest career(String group, int index, int count) throws Exception {
        return new ObjectMapper().readValue("""
            {"schemaVersion":2,"snapshotId":"native-test","site":{"host":"new-tenant.recruiter.im","pathPattern":"/mrs2/applicant/resume/writeResume"},
             "sections":[{"sectionId":"hplace-mrs2-career","fields":[],"items":[{"itemId":"row-opaque","itemGroupId":"%s","fields":[
              {"candidateId":"employment","element":"select","control":"select","visibility":"visible","domId":"hplace.mrs2.career.careerCriteriaCodeSn","domName":"hplace.mrs2.career.careerCriteriaCodeSn","semanticContext":{"repeat":{"groupId":"%s","rowIndex":%d,"rowCount":%d}}},
              {"candidateId":"company","element":"input","control":"text","visibility":"visible","domId":"hplace.mrs2.career.company","domName":"hplace.mrs2.career.company","semanticContext":{"repeat":{"groupId":"%s","rowIndex":%d,"rowCount":%d}}}
             ]}]}]}
            """.formatted(group,group,index,count,group,index,count), com.careerform.formanalysis.dto.FieldsAnalysisRequest.class);
    }
    @Test void mapsCareerInItsOwnRowAndPreservesSchemaTwoWithoutSearch() throws Exception {
        var response=service(HplaceCompanyFormPolicyFactory.createNative()).analyze(career("hplace.mrs2.career",0,1));
        assertThat(response.analysisStatus().name()).isEqualTo("COMPLETE");
        assertThat(response.mode().name()).isEqualTo("ADAPTER");
        var company=(com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchedFieldAnalysis)response.fields().get(1);
        assertThat(company.valueBinding()).isEqualTo(new com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding("careers.career.companyName"));
        assertThat(company.writePlan().command().name()).isEqualTo("SET_TEXT");
        assertThat(response.executionPolicy().browserPolicy().get("schemaVersion")).isEqualTo(2);
    }
    @Test void rejectsCrossGroupAndNoncontiguousIndices() throws Exception {
        for (var request:java.util.List.of(career("hplace.mrs2.project",0,1),career("hplace.mrs2.career",1,2))) {
            assertThat(service(HplaceCompanyFormPolicyFactory.createNative()).analyze(request).analysisStatus().name()).isEqualTo("BLOCKED");
        }
    }
    @Test void usesOnlyTheSectionActivationFlagForDisabledNativeRows() throws Exception {
        var doc=HplaceCompanyFormPolicyFactory.createNative();
        var tree=new ObjectMapper().valueToTree(doc.executionPolicy());
        ((com.fasterxml.jackson.databind.node.ObjectNode)tree.path("browserPolicy").path("nativeForm").path("sections").get(1)).put("enabled",false).put("reason","실DOM 확인 대기");
        var execution=new ObjectMapper().treeToValue(tree,com.careerform.formanalysis.dto.ExecutionPolicy.class);
        var response=service(doc.withExecutionPolicy(execution)).analyze(career("hplace.mrs2.career",0,1));
        assertThat(response.mode().name()).isEqualTo("ADAPTER");
        assertThat(response.fields()).allMatch(f->f instanceof com.careerform.formanalysis.dto.FieldsAnalysisResponse.NoMatchFieldAnalysis);
    }
    @Test void resolvesOnlyTheOwnedAddActionForAnEmptyNativeSection() throws Exception {
        var doc=HplaceCompanyFormPolicyFactory.createNative();
        var policy=com.careerform.formanalysis.application.policy.CompanyFormPolicy.create(doc.companyKey(),doc.version(),doc.preparationFingerprint(),doc.fieldsFingerprint(),doc.actionRules(),doc.fieldRules(),doc.sectionContracts(),doc.executionPolicy(),new SupportedProfileFields()::contains);
        var request=new ObjectMapper().readValue("""
          {"schemaVersion":2,"snapshotId":"prep","site":{"host":"tenant.recruiter.im","pathPattern":"/mrs2/applicant/resume/writeResume"},"sections":[{"sectionId":"hplace-mrs2-career","actionCandidates":[{"candidateId":"add-opaque","domId":"hplace.mrs2.career.add","element":"button","control":"button","visibility":"visible"}]}]}
          """,com.careerform.formanalysis.dto.PreparationAnalysisRequest.class);
        var result=new com.careerform.formanalysis.application.policy.StoredPolicyActionResolver(policy).resolve(request);
        assertThat(result.results().getFirst()).isInstanceOf(com.careerform.formanalysis.application.port.ActionResolver.AddAction.class);
    }

    @Test void rejectsUnknownBrowserOperationAndCircularDriverGraph() throws Exception {
        for (String invalid : java.util.List.of("operation", "cycle")) {
            var mapper = new ObjectMapper();
            var doc = HplaceCompanyFormPolicyFactory.createNative();
            var tree = mapper.valueToTree(doc.executionPolicy());
            var form = tree.path("browserPolicy").path("nativeForm");
            if (invalid.equals("operation")) ((com.fasterxml.jackson.databind.node.ObjectNode)form).put("operation", "SUBMIT");
            else {
                var driver = (com.fasterxml.jackson.databind.node.ObjectNode) form.path("sections").get(1).path("fields").get(0).path("driver");
                driver.withArray("dependencies").add("hplace.mrs2.career.careerCriteriaCodeSn");
            }
            var execution = mapper.treeToValue(tree,com.careerform.formanalysis.dto.ExecutionPolicy.class);
            var repository = mock(FormAnalysisPolicyMongoRepository.class);
            when(repository.findByCompanyKeyAndVersion("hplace",4)).thenReturn(Optional.of(doc.withExecutionPolicy(execution)));
            assertThat(new MongoHplacePolicyProvider(repository,new SupportedProfileFields(),4).find()).isInstanceOf(com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Unavailable.class);
        }
    }

    @Test void preservesRegistrationWithoutAttachingTheDetailOnlyBrowserPolicy() throws Exception {
        var request = new ObjectMapper().readValue("""
            {"schemaVersion":2,"snapshotId":"registration-synthetic","site":{"host":"tenant.recruiter.im","pathPattern":"/app/applicant/registResume"},"sections":[{"sectionId":"hplace-registration","fields":[
              {"candidateId":"name","element":"input","control":"text","visibility":"visible","domId":"hplace.registration.name","domName":"hplace.registration.name"},
              {"candidateId":"mobile","element":"input","control":"text","visibility":"visible","domId":"hplace.registration.mobile","domName":"hplace.registration.mobile"},
              {"candidateId":"email","element":"input","control":"text","visibility":"visible","domId":"hplace.registration.email","domName":"hplace.registration.email"}
            ]}]}
            """, com.careerform.formanalysis.dto.FieldsAnalysisRequest.class);
        var response = service(HplaceCompanyFormPolicyFactory.createNative()).analyze(request);
        assertThat(response.mode().name()).isEqualTo("ADAPTER");
        assertThat(response.fields()).hasSize(3).allMatch(f -> f instanceof com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchedFieldAnalysis);
        assertThat(response.executionPolicy()).isNull();
    }

}
