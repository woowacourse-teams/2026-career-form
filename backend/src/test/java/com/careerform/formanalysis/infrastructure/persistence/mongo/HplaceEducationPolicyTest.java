package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.policy.StoredPolicyFieldMappingResolver;
import com.careerform.formanalysis.application.policy.HplaceFormFingerprint;
import com.careerform.formanalysis.application.port.FieldMappingResolver.Match;
import com.careerform.formanalysis.application.port.FieldMappingResolver.NoMatch;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;

class HplaceEducationPolicyTest {
    private static final ObjectMapper MAPPER=new ObjectMapper();
    private com.careerform.formanalysis.application.policy.CompanyFormPolicy policy(FormAnalysisPolicyDocument d) {
        return com.careerform.formanalysis.application.policy.CompanyFormPolicy.create(d.companyKey(),d.version(),d.preparationFingerprint(),d.fieldsFingerprint(),d.actionRules(),d.fieldRules(),d.sectionContracts(),d.executionPolicy(),new SupportedProfileFields()::contains);
    }
    private FieldsAnalysisRequest request(String section,String group,String name) throws Exception {
        var r=MAPPER.createObjectNode();r.put("schemaVersion",2).put("snapshotId","synthetic");r.putObject("site").put("host","synthetic.recruiter.im").put("pathPattern","/mrs2/applicant/resume/writeResume");
        var s=r.putArray("sections").addObject().put("sectionId","hplace-mrs2-"+section);s.putArray("fields");
        var f=s.putArray("items").addObject().put("itemId","hplace-mrs2-"+section+"-item-0").put("itemGroupId","hplace.mrs2."+group).putArray("fields").addObject().put("candidateId","major").put("domId","hplace.mrs2."+section+"."+name).put("domName","hplace.mrs2."+section+"."+name).put("element","input").put("control","text").put("visibility","visible");
        f.putObject("semanticContext").putObject("repeat").put("groupId","hplace.mrs2."+group).put("rowIndex",0).put("rowCount",1);
        return MAPPER.treeToValue(r,FieldsAnalysisRequest.class);
    }
    @Test void mapsMajorRoleWithinUniversityGroupAndRejectsCrossParentFields() throws Exception {
        var policy=policy(HplaceCompanyFormPolicyFactory.createNative());
        for(String section:List.of("college","graduateSchool")) {
            var request=request(section,section,"major0.majorName");
            assertThat(new HplaceFormFingerprint().matches(policy,request)).isTrue();
            assertThat(new StoredPolicyFieldMappingResolver(policy,true).resolve(request).results().getFirst()).isInstanceOf(Match.class);
            var wrong=request(section,section.equals("college")?"graduateSchool":"college","major0.majorName");
            assertThat(new HplaceFormFingerprint().matches(policy,wrong)).isFalse();
            assertThat(new StoredPolicyFieldMappingResolver(policy,true).resolve(wrong).results().getFirst()).isInstanceOf(NoMatch.class);
        }
    }
    @Test void doesNotMapTotalCreditsToMajorCredits() throws Exception {
        var policy=policy(HplaceCompanyFormPolicyFactory.createNative());
        assertThat(new StoredPolicyFieldMappingResolver(policy,true).resolve(request("college","college","majorCredits")).results().getFirst()).isInstanceOf(NoMatch.class);
        assertThat(policy.fieldRules()).anyMatch(f->f.structuralName().equals("hplace.mrs2.college.score"));
    }
    @Test void rejectsDepthBeyondTwoAndMismatchedGpaPeer() throws Exception {
        for(String mutation:List.of("depth","gpa")) {
            var doc=HplaceCompanyFormPolicyFactory.createNative();var tree=MAPPER.valueToTree(doc.executionPolicy());
            var section=java.util.stream.StreamSupport.stream(tree.path("browserPolicy").path("nativeForm").path("sections").spliterator(),false).filter(s->s.path("id").asText().equals("hplace-mrs2-college")).findFirst().orElseThrow();
            var target=java.util.stream.StreamSupport.stream(section.path("fields").spliterator(),false).filter(f->f.path("name").asText().endsWith(mutation.equals("depth")?"major0.majorName":".score")).findFirst();
            assertThat(target).isPresent();
            if(mutation.equals("depth")) ((ObjectNode)target.orElseThrow()).put("rawName","college[{index}].collegeMajor[0].child[0].majorName");
            else ((ObjectNode)target.orElseThrow().path("gpa")).put("peer","hplace.mrs2.graduateSchool.perfectScore");
            var bad=doc.withExecutionPolicy(MAPPER.treeToValue(tree,com.careerform.formanalysis.dto.ExecutionPolicy.class));
            assertThatThrownBy(()->policy(bad)).isInstanceOf(RuntimeException.class);
        }
    }
    @Test void acceptsOnlyMajorAddBelongingToTheNamedParentItem() throws Exception {
        var policy=policy(HplaceCompanyFormPolicyFactory.createNative());
        var r=MAPPER.createObjectNode();r.put("schemaVersion",2).put("snapshotId","synthetic");r.putObject("site").put("host","synthetic.recruiter.im").put("pathPattern","/mrs2/applicant/resume/writeResume");
        var s=r.putArray("sections").addObject().put("sectionId","hplace-mrs2-college");s.putArray("actionCandidates");
        var item=s.putArray("items").addObject().put("itemId","hplace-mrs2-college-item-1");
        var a=item.putArray("actionCandidates").addObject().put("candidateId","major-add").put("element","button").put("control","button").put("visibility","visible").put("domId","hplace.mrs2.college.major.add.1");
        var fingerprint=new HplaceFormFingerprint();
        assertThat(fingerprint.matches(policy,MAPPER.treeToValue(r,com.careerform.formanalysis.dto.PreparationAnalysisRequest.class))).isTrue();
        item.put("itemId","hplace-mrs2-college-item-0");
        assertThat(fingerprint.matches(policy,MAPPER.treeToValue(r,com.careerform.formanalysis.dto.PreparationAnalysisRequest.class))).isFalse();
        item.put("itemId","hplace-mrs2-college-item-1");a.put("domId","hplace.mrs2.graduateSchool.major.add.1");
        assertThat(fingerprint.matches(policy,MAPPER.treeToValue(r,com.careerform.formanalysis.dto.PreparationAnalysisRequest.class))).isFalse();
    }

    @Test void acceptsMajorDescendantsWithOwnershipInsteadOfFixedWrapperDepth() throws Exception {
        var doc=HplaceCompanyFormPolicyFactory.createNative();
        var tree=MAPPER.valueToTree(doc.executionPolicy());
        for (var section:tree.path("browserPolicy").path("nativeForm").path("sections")) {
            if (!section.has("nested")) continue;
            ((ObjectNode)section.path("nested")).put("wrapperSelector", "div.subject[data-wrap=\"major\"]")
                .put("rowSelector", "div.row.loop[data-loop=\"collegeMajor\"]");
        }
        var updated=doc.withExecutionPolicy(MAPPER.treeToValue(tree,com.careerform.formanalysis.dto.ExecutionPolicy.class));
        assertThatCode(()->policy(updated)).doesNotThrowAnyException();
    }

    @Test void acceptsYearMonthOrFullDateForEveryEducationDate() {
        var tree=MAPPER.valueToTree(HplaceCompanyFormPolicyFactory.createNative().executionPolicy());
        var formats=new java.util.TreeMap<String,List<String>>();
        for (var section:tree.path("browserPolicy").path("nativeForm").path("sections")) {
            if (!List.of("hplace-mrs2-highschool","hplace-mrs2-college","hplace-mrs2-graduateSchool").contains(section.path("id").asText())) continue;
            for (var field:section.path("fields")) {
                if (!field.has("date")) continue;
                var values=new java.util.ArrayList<String>();
                field.path("date").path("formats").forEach(v->values.add(v.asText()));
                formats.put(field.path("name").asText(),values);
            }
        }
        assertThat(formats.keySet()).containsExactlyInAnyOrder(
            "hplace.mrs2.highschool.entranceDate","hplace.mrs2.highschool.graduationDate",
            "hplace.mrs2.college.entranceDate","hplace.mrs2.college.graduationDate",
            "hplace.mrs2.graduateSchool.entranceDate","hplace.mrs2.graduateSchool.graduationDate");
        assertThat(formats.values()).allSatisfy(v->assertThat(v).containsExactly("YM","YMD"));
        assertThatCode(()->policy(HplaceCompanyFormPolicyFactory.createNative())).doesNotThrowAnyException();
    }

    @Test void majorSearchesWaitForTheirDetailsAndAttendanceUsesPolicyLabels() {
        var tree=MAPPER.valueToTree(HplaceCompanyFormPolicyFactory.createNative().executionPolicy());
        var drivers=new java.util.TreeMap<String,List<String>>();
        for (var section:tree.path("browserPolicy").path("nativeForm").path("sections")) {
            for (var field:section.path("fields")) {
                var name=field.path("name").asText();
                if (!name.matches("hplace\\.mrs2\\.(college|graduateSchool)\\.major[0-2]\\.majorName")) continue;
                var deps=new java.util.ArrayList<String>();
                field.path("driver").path("dependencies").forEach(v->deps.add(v.asText()));
                var settled=new java.util.ArrayList<String>();
                field.path("driver").path("settled").forEach(v->{
                    assertThat(v.path("state").asText()).isEqualTo("enabled");
                    settled.add(v.path("field").asText());
                });
                assertThat(settled).isEqualTo(deps);
                drivers.put(name,deps);
            }
        }
        assertThat(drivers).hasSize(6);
        drivers.forEach((name,deps)->{
            var prefix=name.substring(0,name.length()-"majorName".length());
            var expected=new java.util.ArrayList<>(List.of(prefix+"majorTypeCode",prefix+"majorCategoryCode"));
            if (prefix.endsWith("major0.")) expected.add(prefix+"dayOrNight");
            assertThat(deps).as(name).isEqualTo(expected);
        });
        var attendance=java.util.stream.StreamSupport.stream(tree.path("browserPolicy").path("normalizations").spliterator(),false)
            .filter(r->r.path("keys").toString().contains("attendanceType")).findFirst().orElseThrow();
        var keys=new java.util.ArrayList<String>();
        attendance.path("keys").forEach(v->keys.add(v.asText()));
        assertThat(keys).containsExactlyInAnyOrder("education.highSchool.attendanceType","education.university.attendanceType","education.graduateSchool.attendanceType");
        assertThat(attendance.path("values").path("attendance:day").asText()).isEqualTo("주간");
        assertThat(attendance.path("values").path("attendance:night").asText()).isEqualTo("야간");
        assertThatCode(()->policy(HplaceCompanyFormPolicyFactory.createNative())).doesNotThrowAnyException();
    }

}
