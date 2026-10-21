package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchedFieldAnalysis;

class HplaceSearchPolicyTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private com.careerform.formanalysis.application.FieldsAnalysisService service(FormAnalysisPolicyDocument doc) {
        var repository=mock(FormAnalysisPolicyMongoRepository.class);
        when(repository.findByCompanyKeyAndVersion("hplace",4)).thenReturn(Optional.of(doc));
        var router=new com.careerform.formanalysis.application.FormAnalysisRouter((h,p)->new com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.NotRegistered(),
            (h,p)->{throw new AssertionError("DNS fallback");},com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Unavailable::new,new MongoHplacePolicyProvider(repository,new SupportedProfileFields(),4));
        return new com.careerform.formanalysis.application.FieldsAnalysisService(Optional.empty(),router,new com.careerform.formanalysis.application.FieldInteractionPolicy(),new SupportedProfileFields());
    }
    private FieldsAnalysisRequest request(String section,String group,String... fields) throws Exception {
        var root=MAPPER.createObjectNode();root.put("schemaVersion",2).put("snapshotId","synthetic");root.putObject("site").put("host","synthetic.recruiter.im").put("pathPattern","/mrs2/applicant/resume/writeResume");
        var s=root.putArray("sections").addObject().put("sectionId","hplace-mrs2-"+section);var top=s.putArray("fields");
        var target=group==null?top:s.putArray("items").addObject().put("itemId","synthetic-row").put("itemGroupId","hplace.mrs2."+group).putArray("fields");
        for(String name:fields){var f=target.addObject().put("candidateId",name).put("domName","hplace.mrs2."+section+"."+name).put("domId","hplace.mrs2."+section+"."+name).put("element","input").put("control","text").put("visibility","visible");if(group!=null)f.putObject("semanticContext").putObject("repeat").put("groupId","hplace.mrs2."+group).put("rowIndex",0).put("rowCount",1);}
        return MAPPER.treeToValue(root,FieldsAnalysisRequest.class);
    }
    @Test void mapsCertificateFieldsWithoutGradeGuess() throws Exception {
        var response=service(HplaceCompanyFormPolicyFactory.createNative()).analyze(request("license","license","licenseName","organization","registNumber","acquireDate"));
        assertThat(response.analysisStatus().name()).isEqualTo("COMPLETE");assertThat(response.fields()).hasSize(4).allMatch(f->f instanceof MatchedFieldAnalysis);
        assertThat(response.fields().stream().map(f->((MatchedFieldAnalysis)f).valueBinding())).containsExactly(new DirectBinding("certifications.certificate.name"),new DirectBinding("certifications.certificate.issuer"),new DirectBinding("certifications.certificate.registrationNo"),new DirectBinding("certifications.certificate.acquisitionDate"));
    }
    @Test void acceptsSearchCandidateOnlyInOwnedRow() throws Exception {
        var service=service(HplaceCompanyFormPolicyFactory.createNative());
        assertThat(service.analyze(request("college","college","academyName")).analysisStatus().name()).isEqualTo("COMPLETE");
        assertThat(service.analyze(request("college","graduateSchool","academyName")).analysisStatus().name()).isEqualTo("BLOCKED");
    }
    @Test void rejectsExamAcquisitionDateAsExamDate() throws Exception {
        var service=service(HplaceCompanyFormPolicyFactory.createNative());
        var response=service.analyze(request("foreignExam","foreignExam","languageExamName","registNumber","score"));
        assertThat(response.analysisStatus().name()).isEqualTo("COMPLETE");
        assertThat(((MatchedFieldAnalysis)response.fields().get(2)).valueBinding()).isEqualTo(new DirectBinding("languages.languageTest.grade"));
        assertThat(service.analyze(request("foreignExam","foreignExam","languageExamName","examDate")).analysisStatus().name()).isEqualTo("BLOCKED");
    }
    @Test void refusesInvalidSearchProtocolAndMetadataContracts() throws Exception {
        for(String property:java.util.List.of("protocol","metadata","gate")) {
            var doc=HplaceCompanyFormPolicyFactory.createNative();var tree=MAPPER.valueToTree(doc.executionPolicy());
            var field=java.util.stream.StreamSupport.stream(tree.path("browserPolicy").path("nativeForm").path("sections").spliterator(),false).filter(s->s.path("id").asText().equals("hplace-mrs2-foreignExam")).findFirst().orElseThrow().path("fields").get(0);
            var search=(com.fasterxml.jackson.databind.node.ObjectNode)field.path("search");
            if(property.equals("protocol"))search.put("protocol","SUBMIT");else if(property.equals("metadata"))search.putObject("metadata").put("setup","data-unsafe");else ((com.fasterxml.jackson.databind.node.ObjectNode)field).putObject("gate").put("search","unknown").put("mode","COMMITTED");
            var response=service(doc.withExecutionPolicy(MAPPER.treeToValue(tree,com.careerform.formanalysis.dto.ExecutionPolicy.class))).analyze(request("foreignExam","foreignExam","languageExamName"));
            assertThat(response.analysisStatus().name()).isEqualTo("BLOCKED");
        }
    }
    @Test void acceptsOnlyTheExplicitExamPlaceholderAndNeverMapsIt() throws Exception {
        var tree=MAPPER.valueToTree(request("foreignExam","foreignExam","languageExamName"));
        var candidate=(com.fasterxml.jackson.databind.node.ObjectNode)tree.path("sections").get(0).path("items").get(0).path("fields").get(0);
        candidate.put("inert",true).put("displayName","입력 불가(인증 시험 — 사용자 처리)");
        var service=service(HplaceCompanyFormPolicyFactory.createNative());
        var response=service.analyze(MAPPER.treeToValue(tree,FieldsAnalysisRequest.class));
        assertThat(response.analysisStatus().name()).isEqualTo("COMPLETE");
        assertThat(response.fields().getFirst()).isInstanceOf(com.careerform.formanalysis.dto.FieldsAnalysisResponse.NoMatchFieldAnalysis.class);
        candidate.put("displayName","arbitrary");
        assertThat(service.analyze(MAPPER.treeToValue(tree,FieldsAnalysisRequest.class)).analysisStatus().name()).isEqualTo("BLOCKED");
    }
}
