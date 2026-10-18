package com.careerform.formanalysis.application.policy;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.careerform.formanalysis.dto.ExecutionPolicy;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;

/** Validates agreement between one DB snapshot's browser and mapping contracts. */
final class NativePolicyContract {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private NativePolicyContract() { }
    static List<SectionContract> validate(List<SectionContract> contracts, List<FieldRule> rules, ExecutionPolicy execution) {
        if (contracts.isEmpty()) return contracts;
        require(execution != null && execution.version() == 1 && execution.browserPolicy() != null
            && execution.componentPolicy() == null && execution.searches().isEmpty() && execution.failureScopes().isEmpty()
            && execution.address() == null);
        var browser = MAPPER.valueToTree(execution.browserPolicy());
        require(keys(browser, "schemaVersion", "nativeForm", "runtimeRules", "fields", "normalizations", "reveals", "collection", "repeatHints", "educationHints", "freshRowFields", "freshDefaults", "stateDrivers", "searchStageBase", "searchRowStride", "refreshAfterPass", "diagnosticsTitle", "addressAction", "mainWorldBridge"));
        require(browser.path("schemaVersion").asInt() == 2 && browser.path("fields").isArray() && browser.path("fields").isEmpty()
            && browser.path("mainWorldBridge").asText().equals("NONE"));
        var form = browser.path("nativeForm");
        require(keys(form, "capabilities", "path", "formSelector", "rootSelector", "assetPaths", "maxFieldsRequests", "sections", "unsupportedSections")
            && text(form.path("formSelector")) && text(form.path("rootSelector"))
            && form.isObject() && form.path("path").asText().equals(HplaceApplicantSite.DETAIL_PATH)
            && bounded(form.path("maxFieldsRequests"), 1, 8) && form.path("assetPaths").isArray()
            && !form.path("assetPaths").isEmpty() && form.path("assetPaths").size() <= 8
            && form.path("sections").isArray() && form.path("sections").size() == contracts.size());
        var capabilities = new java.util.HashSet<String>();
        form.path("capabilities").forEach(n -> capabilities.add(n.asText()));
        require(form.path("capabilities").size() == capabilities.size() && (capabilities.equals(Set.of("SCOPED_FIELDS", "SINGLE_DEPTH_ROWS", "NATIVE_DRIVERS", "NATIVE_DATES")) || capabilities.equals(Set.of("SCOPED_FIELDS", "SINGLE_DEPTH_ROWS", "NATIVE_DRIVERS", "NATIVE_DATES", "KEYPRESS_COMMITTED_TUPLE"))));
        var result = new ArrayList<SectionContract>();
        var ids = new java.util.HashSet<String>();
        for (var section : form.path("sections")) {
            String id = section.path("id").asText();
            require(keys(section, "id", "title", "selector", "enabled", "reason", "anchors", "rows", "action", "fields", "excludedRow")
                && ids.add(id) && section.path("enabled").isBoolean() && text(section.path("selector"))
                && section.path("fields").isArray() && section.path("fields").size() <= 64);
            var contract = contracts.stream().filter(c -> c.sectionId().equals(id)).findFirst().orElseThrow();
            require(section.path("fields").size() == contract.fields().size());
            require(contract.excludedRow() == null ? !section.has("excludedRow") : MAPPER.valueToTree(contract.excludedRow()).equals(section.path("excludedRow")));
            if (section.has("action")) require(keys(section.path("action"),"id","selector","label","categoryId","profileSectionId","scope")
                && (!section.path("action").has("scope") || section.path("action").path("scope").asText().equals("SECTION")));

            if (contract.itemGroupId() != null) require(section.path("rows").path("groupId").asText().equals(contract.itemGroupId())
                && section.path("rows").path("maxCount").asInt() == contract.maxRows()
                && section.path("rows").path("selector").asText().startsWith(":scope > "));
            var names = new java.util.HashSet<String>();
            for (var field : section.path("fields")) {
                String name = field.path("name").asText(), type = field.path("type").asText();
                require(keys(field, "name", "rawName", "scopeSelector", "dynamicOptions", "type", "label", "binding", "maxLength", "min", "max", "step", "options", "date", "driver", "search", "gate")
                    && names.add(name) && Set.of("text", "number", "textarea", "select", "radio").contains(type)
                    && text(field.path("label")) && field.path("rawName").asText().matches("[A-Za-z][A-Za-z0-9_]*(?:\\[\\{index}])?(?:\\.[A-Za-z][A-Za-z0-9_]*)*"));
                var structure = contract.fields().stream().filter(f -> f.structuralName().equals(name)).findFirst().orElseThrow();
                var rule = rules.stream().filter(r -> r.structuralName().equals(name) && name.equals(r.requiredDomName())
                    && java.util.Objects.equals(contract.itemGroupId(), r.requiredItemGroupId())).findFirst().orElseThrow();
                String control = type.equals("number") ? "text" : type;
                String element = Set.of("select", "textarea").contains(type) ? type : "input";
                require(structure.control().name().equalsIgnoreCase(control) && structure.element().name().equalsIgnoreCase(element)
                    && rule.control() == structure.control() && rule.element() == structure.element()
                    && MAPPER.valueToTree(rule.valueBinding()).equals(field.path("binding")));
                if (type.equals("radio") || type.equals("select")) require(field.path("options").isObject()
                    || type.equals("select") && field.path("dynamicOptions").path("labels").isArray()
                        && field.path("dynamicOptions").path("codeFormat").asText().equals("POSITIVE_INTEGER")
                    || type.equals("select") && keys(field.path("dynamicOptions"),"codeFormat")
                        && field.path("dynamicOptions").path("codeFormat").asText().equals("OBSERVED") && field.path("gate").path("mode").asText().equals("GRADE_ONLY"));
                if (field.has("search")) {
                    require(type.equals("text") && field.has("driver") && capabilities.contains("KEYPRESS_COMMITTED_TUPLE"));
                    validateSearch(field.path("search"));
                }
                if (field.has("date")) validateDate(field.path("date"));
                if (field.has("driver")) require(keys(field.path("driver"), "stage", "timeoutMs", "dependencies", "settled")
                    && field.path("driver").path("dependencies").isArray() && field.path("driver").path("settled").isArray()
                    && bounded(field.path("driver").path("stage"), 1, 6)
                    && bounded(field.path("driver").path("timeoutMs"), 1, 2000));
            }
            require(names.containsAll(contract.anchors()));
            if(contract.excludedRow()!=null) require(java.util.stream.StreamSupport.stream(section.path("fields").spliterator(),false)
                .anyMatch(f->f.path("name").asText().equals(contract.excludedRow().name()) && f.path("search").path("kind").asText().equals("EXAM")));
            for(var field:section.path("fields")) if(field.has("gate")) {
                var gate=field.path("gate");
                require(keys(gate,"search","mode") && Set.of("COMMITTED","GRADE_ONLY","SCORE_ONLY","REGISTRATION").contains(gate.path("mode").asText())
                    && java.util.stream.StreamSupport.stream(section.path("fields").spliterator(),false).anyMatch(f->f.path("name").equals(gate.path("search")) && f.has("search")));
            }

            for (var field : section.path("fields")) {
                var driver = field.path("driver");
                if (driver.isMissingNode()) continue;
                var dependencies = new java.util.HashSet<String>();
                for (var dependency : driver.path("dependencies")) {
                    require(dependencies.add(dependency.asText()) && names.contains(dependency.asText()));
                    for (var target : section.path("fields")) if (target.path("name").equals(dependency) && target.has("driver")) {
                        require(target.path("driver").path("stage").asInt() > driver.path("stage").asInt());
                    }
                }
                for (var settled : driver.path("settled")) require(keys(settled, "field", "state", "whenLabel")
                    && dependencies.contains(settled.path("field").asText())
                    && Set.of("enabled", "disabled").contains(settled.path("state").asText()));
            }
            // One section switch in browserPolicy is authoritative, including on DB updates.
            result.add(new SectionContract(contract.sectionId(), contract.parentSectionId(), contract.itemGroupId(),
                contract.maxRows(), contract.maxFields(), contract.anchors(), contract.fields(), contract.actions(), section.path("enabled").asBoolean(), contract.excludedRow()));
        }
        return List.copyOf(result);
    }
    private static void validateSearch(JsonNode s) {
        require(keys(s,"protocol","catalogKind","widgetSelector","querySelector","resultsSelector","resultSelector","displaySelector","codeName","kind","metadata","timeoutMs","detailSelector","protectedSelector","protectedVisibleSelector","protectedValueNames","forbiddenCodes","gradeName","scoreName","registrationName")
            && s.path("protocol").asText().equals("KEYPRESS_COMMITTED_TUPLE") && bounded(s.path("timeoutMs"),1,2000)
            && (s.path("catalogKind").isNull() || Set.of("highSchool","university","graduateSchool","certificate","languageTest").contains(s.path("catalogKind").asText()))
            && Set.of("PLAIN","LICENSE","EXAM").contains(s.path("kind").asText()));
        for(String name:List.of("widgetSelector","querySelector","resultsSelector","resultSelector","displaySelector","codeName")) require(text(s.path(name)));
        var metadata=s.path("metadata");
        var required=s.path("kind").asText().equals("EXAM")?List.of("grade","score","setup","value","perfect"):
            s.path("kind").asText().equals("LICENSE")?List.of("score","registration"):List.<String>of();
        require(metadata.isObject() && metadata.size()==required.size());
        for(String name:required)require(metadata.path(name).isTextual() && metadata.path(name).asText().matches("data-[a-z]+"));
        if(s.path("kind").asText().equals("EXAM")) {
            for(String name:List.of("detailSelector","protectedSelector","gradeName","scoreName","registrationName"))require(text(s.path(name)));
            require(s.path("protectedValueNames").isArray() && !s.path("protectedValueNames").isEmpty() && s.path("protectedValueNames").size()<=8
                && s.path("forbiddenCodes").isArray() && !s.path("forbiddenCodes").isEmpty() && s.path("forbiddenCodes").size()<=16);
            for(var name:s.path("protectedValueNames"))require(text(name));
            for(var code:s.path("forbiddenCodes"))require(text(code));
        }
        if(s.path("kind").asText().equals("LICENSE"))require(text(s.path("registrationName")));
    }
    private static void validateDate(JsonNode d) {
        require(keys(d,"group","role","formats","peer","forbiddenAfterToday","tokens","maxDateSelector")
            && text(d.path("group")) && Set.of("START","END","SINGLE").contains(d.path("role").asText())
            && d.path("formats").isArray() && !d.path("formats").isEmpty() && d.path("formats").size()<=2
            && d.path("forbiddenAfterToday").isBoolean()
            && (d.path("role").asText().equals("SINGLE")?!d.has("peer"):text(d.path("peer"))));
        for(var f:d.path("formats"))require(Set.of("YM","YMD").contains(f.asText()));
        if(d.has("tokens")){require(d.path("tokens").isArray() && d.path("tokens").size()<=8);for(var t:d.path("tokens"))require(text(t));}
        if(d.has("maxDateSelector"))require(text(d.path("maxDateSelector")));
    }
    private static boolean keys(JsonNode node, String... allowed) {
        if (!node.isObject()) return false;
        var permitted = Set.of(allowed);
        var names = node.fieldNames();
        while (names.hasNext()) if (!permitted.contains(names.next())) return false;
        return true;
    }
    private static boolean text(JsonNode node) { return node.isTextual() && !node.asText().isBlank() && node.asText().length() <= 500; }
    private static boolean bounded(JsonNode node, int min, int max) { return node.isIntegralNumber() && node.asInt() >= min && node.asInt() <= max; }
    private static void require(boolean valid) { if (!valid) throw new IllegalArgumentException("Invalid native browser contract"); }
}
