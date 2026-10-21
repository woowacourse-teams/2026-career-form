package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.policy.*;
import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.*;

class HplaceAddressPolicyTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private CompanyFormPolicy policy(FormAnalysisPolicyDocument d) {
        return CompanyFormPolicy.create(d.companyKey(),d.version(),d.preparationFingerprint(),d.fieldsFingerprint(),d.actionRules(),d.fieldRules(),d.sectionContracts(),d.executionPolicy(),new SupportedProfileFields()::contains);
    }
    private PreparationAnalysisRequest preparation(String action) throws Exception {
        return MAPPER.readValue("""
            {"schemaVersion":2,"snapshotId":"address","site":{"host":"synthetic.recruiter.im","pathPattern":"/mrs2/applicant/resume/writeResume"},"sections":[{"sectionId":"hplace-mrs2-currentAddress","actionCandidates":[{"candidateId":"address-action","domId":"%s","element":"button","control":"button","visibility":"visible"}]}]}
            """.formatted(action),PreparationAnalysisRequest.class);
    }
    private FieldsAnalysisRequest fields() throws Exception {
        return MAPPER.readValue("""
            {"schemaVersion":2,"snapshotId":"address","site":{"host":"synthetic.recruiter.im","pathPattern":"/mrs2/applicant/resume/writeResume"},"sections":[{"sectionId":"hplace-mrs2-currentAddress","fields":[
            {"candidateId":"zip","domId":"hplace.mrs2.currentAddress.zipCode","domName":"hplace.mrs2.currentAddress.zipCode","element":"input","control":"text","visibility":"hidden"},
            {"candidateId":"base","domId":"hplace.mrs2.currentAddress.address","domName":"hplace.mrs2.currentAddress.address","element":"input","control":"text","visibility":"visible","readonly":true},
            {"candidateId":"detail","domId":"hplace.mrs2.currentAddress.detailAddress","domName":"hplace.mrs2.currentAddress.detailAddress","element":"input","control":"text","visibility":"visible"}]}]}
            """,FieldsAnalysisRequest.class);
    }
    @Test void onlyOffersCurrentAddressAction() throws Exception {
        var p=policy(HplaceCompanyFormPolicyFactory.createNative());var req=preparation("hplace.mrs2.currentAddress.search");
        assertThat(new HplaceFormFingerprint().matches(p,req)).isTrue();
        assertThat(new StoredPolicyActionResolver(p).resolve(req).results().getFirst()).isInstanceOf(ActionResolver.SearchAddressAction.class);
        for(String kind:List.of("residentAddress","parentAddress","familyAddress","modalSubmit","ok","copyAddress"))
            assertThat(new HplaceFormFingerprint().matches(p,preparation("hplace.mrs2."+kind+".search"))).isFalse();
    }
    @Test void mapsReadbackTripletWithHiddenZipAndReadonlyBase() throws Exception {
        var p=policy(HplaceCompanyFormPolicyFactory.createNative());
        assertThat(new HplaceFormFingerprint().matches(p,fields())).isTrue();
        assertThat(new StoredPolicyFieldMappingResolver(p,true).resolve(fields()).results()).hasSize(3).allMatch(r->r instanceof FieldMappingResolver.Match);
        var tree=MAPPER.valueToTree(fields());((ObjectNode)tree.path("sections").get(0).path("fields").get(1)).put("readonly",false);
        assertThat(new HplaceFormFingerprint().matches(p,MAPPER.treeToValue(tree,FieldsAnalysisRequest.class))).isFalse();
    }
    @Test void rejectsStagedCommitWithoutFullReadbackOrOwnedConfirmation() throws Exception {
        var d=HplaceCompanyFormPolicyFactory.createNative();var baseline=MAPPER.valueToTree(d.executionPolicy());
        assertThat(baseline.path("browserPolicy").path("nativeForm").path("address").isObject()).isTrue();
        for(String invalid:List.of("triplet","protocol","confirm","activation","resident","unknown")) {
            var tree=baseline.deepCopy();var address=(ObjectNode)tree.path("browserPolicy").path("nativeForm").path("address");
            switch(invalid) {
                case "triplet" -> address.putArray("fields");
                case "protocol" -> address.put("protocol","SUBMIT");
                case "confirm" -> address.put("confirmMessage","");
                case "activation" -> address.putArray("activation").addObject().put("op","CLICK").put("target","commit");
                case "resident" -> ((ObjectNode)address.path("fields").get(0)).put("rawName","residentAddress.zipCode");
                default -> address.put("submit",true);
            }
            var changed=d.withExecutionPolicy(MAPPER.treeToValue(tree,ExecutionPolicy.class));
            assertThatThrownBy(()->policy(changed)).isInstanceOf(IllegalArgumentException.class);
        }
    }
    @Test void rejectsRedirectedOwnedTargets() throws Exception {
        var d=HplaceCompanyFormPolicyFactory.createNative();
        for(String key:List.of("commitSelector","confirmSelector","confirmOkSelector","modalSelector")) {
            var tree=MAPPER.valueToTree(d.executionPolicy());
            ((ObjectNode)tree.path("browserPolicy").path("nativeForm").path("address")).put(key,"button[type=submit]");
            var changed=d.withExecutionPolicy(MAPPER.treeToValue(tree,ExecutionPolicy.class));
            assertThatThrownBy(()->policy(changed)).isInstanceOf(IllegalArgumentException.class);
        }
    }
    @Test void disabledAddressDoesNotOfferAction() throws Exception {
        var d=HplaceCompanyFormPolicyFactory.createNative();var tree=MAPPER.valueToTree(d.executionPolicy());
        assertThat(tree.path("browserPolicy").path("nativeForm").path("address").isObject()).isTrue();
        ((ObjectNode)tree.path("browserPolicy").path("nativeForm").path("address")).put("enabled",false);
        var p=policy(d.withExecutionPolicy(MAPPER.treeToValue(tree,ExecutionPolicy.class)));
        assertThat(new HplaceFormFingerprint().matches(p,preparation("hplace.mrs2.currentAddress.search"))).isFalse();
        assertThat(new StoredPolicyActionResolver(p).resolve(preparation("hplace.mrs2.currentAddress.search")).results().getFirst()).isInstanceOf(ActionResolver.NoAction.class);
    }
}
