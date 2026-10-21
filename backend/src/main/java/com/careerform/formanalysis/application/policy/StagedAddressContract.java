package com.careerform.formanalysis.application.policy;

import java.util.List;
import java.util.Set;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;
import com.careerform.formanalysis.dto.ExecutionPolicy;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

/** Bounded local address commit, separate from ordinary writable native fields. */
final class StagedAddressContract {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final List<String> SELECTORS = List.of("rowSelector","triggerSelector","postcodeSelector","modalSelector","contentSelector","querySelector","searchSelector","resultsSelector","resultSelector","resultAddressSelector","resultPostcodeSelector","resultSelectSelector","commitSelector","confirmSelector","confirmOkSelector","confirmCancelSelector","modalCloseSelector");
    private static final List<String> LABELS = List.of("sectionId","actionId","triggerLabel","searchLabel","commitLabel","confirmMessage","confirmOkLabel","confirmCancelLabel");
    private StagedAddressContract() { }
    static JsonNode address(ExecutionPolicy execution) {
        return MAPPER.valueToTree(execution).path("browserPolicy").path("nativeForm").path("address");
    }
    static void validate(JsonNode a, List<CompanyFormPolicy.FieldRule> rules, JsonNode action) {
        var allowed=new java.util.HashSet<>(SELECTORS);allowed.addAll(LABELS);allowed.addAll(List.of("protocol","enabled","fields","stageSelectors","stagePostcodePlaceholder","activation","timeoutMs"));
        require(keys(a,allowed) && a.path("protocol").asText().equals("STAGED_MODAL_COMMIT") && a.path("enabled").isBoolean()
            && a.path("timeoutMs").isIntegralNumber() && a.path("timeoutMs").asInt()>=1000 && a.path("timeoutMs").asInt()<=5000);
        for(String key:SELECTORS)require(text(a.path(key)));for(String key:LABELS)require(text(a.path(key)));
        require(a.path("sectionId").asText().equals("hplace-mrs2-currentAddress") && a.path("actionId").asText().equals("hplace.mrs2.currentAddress.search")
            && action.path("domId").equals(a.path("actionId")) && action.path("element").asText().equals("button") && !action.has("domName"));
        var fixedTargets=java.util.Map.ofEntries(
            java.util.Map.entry("rowSelector","section.writeResume[data-code=\"13\"] div[data-row=\"address\"].address"),
            java.util.Map.entry("triggerSelector","div.addresszipcode button[type=\"button\"][data-type=\"currentAddress\"]"),
            java.util.Map.entry("modalSelector","#modal.modal-bg"),
            java.util.Map.entry("contentSelector",".modal"),
            java.util.Map.entry("commitSelector","button[data-button=\"modalSubmit\"]"),
            java.util.Map.entry("commitLabel","저장"),
            java.util.Map.entry("confirmSelector","#wrapDialog > #Dialog"),
            java.util.Map.entry("confirmOkSelector","button[data-button=\"ok\"]"),
            java.util.Map.entry("confirmOkLabel","확인"),
            java.util.Map.entry("confirmCancelSelector","button[data-button=\"cancel\"]"),
            java.util.Map.entry("confirmCancelLabel","취소"),
            java.util.Map.entry("modalCloseSelector","button[data-button=\"modalClose\"]"),
            java.util.Map.entry("sectionId","hplace-mrs2-currentAddress"),
            java.util.Map.entry("actionId","hplace.mrs2.currentAddress.search"));
        fixedTargets.forEach((key,value)->require(a.path(key).asText().equals(value)));
        require(a.path("stageSelectors").equals(MAPPER.valueToTree(List.of(".internal input.postcode",".internal input.address",".internal input.details"))));
        require(a.path("activation").isArray() && a.path("activation").size()==1);
        var activation=a.path("activation").get(0);
        require(keys(activation,Set.of("op","target")) && activation.path("op").asText().equals("ACTIVATE_PRIMARY") && activation.path("target").asText().equals("commit"));
        require(a.path("stageSelectors").isArray() && a.path("stageSelectors").size()==3);
        require(text(a.path("stagePostcodePlaceholder")) && a.path("stagePostcodePlaceholder").asText().length()<=10);
        var stages=new java.util.HashSet<String>();for(var s:a.path("stageSelectors"))require(text(s) && stages.add(s.asText()));
        var fields=a.path("fields");require(fields.isArray() && fields.size()==3);
        var suffixes=List.of("zipCode","address","detailAddress");var profile=List.of("contact.contact.postalCode","contact.contact.addressLine1","contact.contact.addressLine2");
        for(int i=0;i<3;i++) {
            var f=fields.get(i);String name="hplace.mrs2.currentAddress."+suffixes.get(i);
            require(keys(f,Set.of("name","rawName","key","readonly","hidden","legacyName")) && f.path("name").asText().equals(name)
                && f.path("rawName").asText().equals("currentAddress."+suffixes.get(i)) && f.path("key").asText().equals(profile.get(i))
                && f.path("readonly").isBoolean() && f.path("readonly").asBoolean()==(i==1)
                && f.path("hidden").isBoolean() && f.path("hidden").asBoolean()==(i==0)
                && (i==2?f.path("legacyName").asText().equals(HplaceFormFingerprint.DETAIL_ADDRESS):!f.has("legacyName")));
            final String key=profile.get(i);
            require(rules.stream().filter(r->r.structuralName().equals(name) && name.equals(r.requiredDomName()) && r.requiredItemGroupId()==null
                && r.element()==FieldsAnalysisRequest.FormElement.INPUT && r.control()==FieldsAnalysisRequest.FormControl.TEXT
                && r.valueBinding().equals(new DirectBinding(key)) && !r.allowReadonlyWrite()).count()==1);
        }
    }
    static List<CompanyFormPolicy.ActionStructure> actions(CompanyFormPolicy policy) {
        var a=policy.stagedAddress();
        return a.path("enabled").asBoolean()?List.of(new CompanyFormPolicy.ActionStructure(a.path("actionId").asText(),PreparationAnalysisRequest.FormElement.BUTTON,PreparationAnalysisRequest.FormControl.BUTTON)):List.of();
    }
    static boolean preparation(JsonNode a, PreparationAnalysisRequest.Section s, Set<String> ids) {
        if(!a.path("enabled").asBoolean() || s.parentSectionId()!=null || s.items()!=null && !s.items().isEmpty() || s.actionCandidates().size()!=1)return false;
        var c=s.actionCandidates().getFirst();return ids.add(c.candidateId()) && c.domName()==null && a.path("actionId").asText().equals(c.domId())
            && c.element()==PreparationAnalysisRequest.FormElement.BUTTON && c.control()==PreparationAnalysisRequest.FormControl.BUTTON
            && c.visibility()==PreparationAnalysisRequest.Visibility.VISIBLE && !Boolean.TRUE.equals(c.disabled()) && !Boolean.TRUE.equals(c.inert()) && !Boolean.TRUE.equals(c.readonly());
    }
    static boolean fields(JsonNode a, FieldsAnalysisRequest.Section s, Set<String> ids, FieldsAnalysisRequest request) {
        if(!a.path("enabled").asBoolean() || s.parentSectionId()!=null || s.items()!=null && !s.items().isEmpty() || s.fields().size()<2 || s.fields().size()>3)return false;
        var names=new java.util.HashSet<String>();
        for(var c:s.fields()) {
            var f=java.util.stream.StreamSupport.stream(a.path("fields").spliterator(),false).filter(n->n.path("name").asText().equals(c.domName())).findFirst().orElse(null);
            if(f==null || !names.add(c.domName()) || !ids.add(c.candidateId()) || !c.domName().equals(c.domId()) || c.element()!=FieldsAnalysisRequest.FormElement.INPUT || c.control()!=FieldsAnalysisRequest.FormControl.TEXT
                || Boolean.TRUE.equals(c.readonly())!=f.path("readonly").asBoolean() || (c.visibility()==FieldsAnalysisRequest.Visibility.HIDDEN)!=f.path("hidden").asBoolean()
                || Boolean.TRUE.equals(c.disabled()) || Boolean.TRUE.equals(c.inert()) || c.semanticContext()!=null && c.semanticContext().repeat()!=null)return false;
        }
        if(!names.contains(a.path("fields").get(0).path("name").asText()) || !names.contains(a.path("fields").get(1).path("name").asText()))return false;
        long legacy=request.fieldCandidatesInTraversalOrder().stream().filter(f->a.path("fields").get(2).path("legacyName").asText().equals(f.domName())).count();
        return s.fields().size()==3?legacy==0:legacy==1;
    }
    private static boolean keys(JsonNode n,Set<String> allowed){if(!n.isObject())return false;var it=n.fieldNames();while(it.hasNext())if(!allowed.contains(it.next()))return false;return true;}
    private static boolean text(JsonNode n){return n.isTextual() && !n.asText().isBlank() && n.asText().length()<=500;}
    private static void require(boolean condition){if(!condition)throw new IllegalArgumentException("Invalid staged address contract");}
}
