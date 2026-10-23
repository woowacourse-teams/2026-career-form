package com.careerform.quality;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;
import com.careerform.formanalysis.infrastructure.adapter.ProviderSemanticSanitizer;

public record QualityCapturedSnapshot(String snapshot, String responseSnapshot, String host,
                                      List<Section> sections, List<Match> matches) {
    public QualityCapturedSnapshot { sections = List.copyOf(sections); matches = List.copyOf(matches); }
    @Override public String toString() { return "QualityCapturedSnapshot[redacted]"; }

    public record Section(String id, String parent, List<Field> fields, List<List<Field>> items) {
        public Section { fields = List.copyOf(fields); items = items.stream().map(List::copyOf).toList(); }
    }

    public record Field(String id, String element, String control, String visibility, boolean disabled,
                        boolean readonly, boolean inert, int options, Semantic semantic) { }
    public record Semantic(String inputType, String inputMode, String autocomplete, boolean required, boolean multiple,
                           Integer maxLength, List<String> words, String group, Integer row, Integer rows) {
        public Semantic { words = List.copyOf(words); }
    }
    public record Match(String id, boolean matched, boolean ready) { }

    public static QualityCapturedSnapshot from(FieldsAnalysisRequest request, FieldsAnalysisResponse response, QualityCaptureBudget budget) {
        var snapshot = budget.text(request.snapshotId(), 128);
        var responseSnapshot = budget.text(response.snapshotId(), 128);
        var host = budget.text(request.site().host(), 253);
        var sections = new ArrayList<Section>();
        for (var section : request.sections()) {
            budget.retain(256);
            var id = budget.text(section.sectionId(), 128);
            var parent = budget.text(section.parentSectionId(), 128);
            var fields = capture(section.fields(), budget);
            var items = new ArrayList<List<Field>>();
            if (section.items() != null) {
                for (var item : section.items()) { budget.retain(128); items.add(capture(item.fields(), budget)); }
            }
            sections.add(new Section(id, parent, fields, items));
        }
        var matches = new ArrayList<Match>();
        for (var field : response.fields()) {
            budget.retain(128);
            var id = budget.text(field.candidateId(), 128);
            var matched = field instanceof FieldsAnalysisResponse.MatchedFieldAnalysis;
            var ready = field instanceof FieldsAnalysisResponse.MatchedFieldAnalysis analysis
                && analysis.interactionStatus() == FieldsAnalysisResponse.InteractionStatus.READY && analysis.writePlan() != null;
            matches.add(new Match(id, matched, ready));
        }
        return new QualityCapturedSnapshot(snapshot, responseSnapshot, host, sections, matches);
    }

    private static List<Field> capture(List<FieldsAnalysisRequest.FieldCandidate> source, QualityCaptureBudget budget) {
        var fields = new ArrayList<Field>();
        for (var field : source) {
            budget.retain(1024);
            var id = budget.text(field.candidateId(), 128);
            var context = field.semanticContext();
            Semantic semantic = null;
            if (context != null) {
                budget.retain(512);
                if (context.labels() != null) {
                    if (context.labels().size() > 8) { throw new QualityAdmissionException(413); }
                    for (var label : context.labels()) { budget.text(label.text(), 120); }
                }
                var safe = ProviderSemanticSanitizer.sanitizeFields(context.labels());
                var words = safe == null ? List.<String>of() : safe.stream()
                    .map(ProviderSemanticSanitizer.SafeLabel::text).map(word -> budget.text(word, 1024)).toList();
                var repeat = context.repeat();
                semantic = new Semantic(name(context.inputType()), name(context.inputMode()), name(context.autocomplete()),
                    Boolean.TRUE.equals(context.required()), Boolean.TRUE.equals(context.multiple()), context.maxLength(), words,
                    repeat == null ? null : budget.text(repeat.groupId(), 128), repeat == null ? null : repeat.rowIndex(), repeat == null ? null : repeat.rowCount());
            }
            fields.add(new Field(id, name(field.element()), name(field.control()), name(field.visibility()),
                Boolean.TRUE.equals(field.disabled()), Boolean.TRUE.equals(field.readonly()), Boolean.TRUE.equals(field.inert()),
                field.options() == null ? 0 : field.options().size(), semantic));
        }
        return List.copyOf(fields);
    }

    public QualityProjection.Snapshot project() {
        if (!snapshot.equals(responseSnapshot)) { throw new IllegalArgumentException("관측 snapshot이 일치하지 않습니다"); }
        var source = sections.stream().flatMap(section -> java.util.stream.Stream.concat(section.fields().stream(), section.items().stream().flatMap(List::stream))).toList();
        var identities = source.stream().map(Field::id).toList();
        if (identities.stream().distinct().count() != identities.size() || matches.stream().anyMatch(match -> !identities.contains(match.id()))) {
            throw new IllegalArgumentException("관측 후보 소속이 일치하지 않습니다");
        }
        var matched = matches.stream().filter(Match::matched).collect(Collectors.toUnmodifiableMap(Match::id, match -> match));
        var repeatGroups = source.stream().map(Field::semantic).filter(java.util.Objects::nonNull)
            .map(Semantic::group).filter(java.util.Objects::nonNull).distinct().toList();
        var sectionIds = sections.stream().map(Section::id).toList();
        var shapes = new ArrayList<String>();
        for (var index = 0; index < sections.size(); index++) {
            var section = sections.get(index);
            shapes.add("section:" + index + ":parent:" + sectionIds.indexOf(section.parent()));
            section.fields().forEach(field -> shapes.add(shape(field, repeatGroups)));
            for (var item = 0; item < section.items().size(); item++) {
                shapes.add("item:" + item);
                section.items().get(item).forEach(field -> shapes.add(shape(field, repeatGroups)));
            }
        }
        var projected = java.util.stream.IntStream.range(0, source.size()).mapToObj(index -> {
            var field = source.get(index);
            var match = matched.get(field.id());
            return new QualityProjection.Field(QualityProjection.digest(snapshot + "|" + field.id()), Integer.toString(index), field.control(),
                match != null, visible(field) && match != null && match.ready());
        }).toList();
        return new QualityProjection.Snapshot(QualityProjection.digest(snapshot), host.toLowerCase(Locale.ROOT),
            QualityProjection.digest("quality-structure-v1|" + String.join("|", shapes)), projected,
            new QualityProjection.Baseline(source.size(), source.stream().allMatch(field -> visible(field)
                && (field.semantic() == null || field.semantic().group() == null || Integer.valueOf(1).equals(field.semantic().rows())))));
    }

    private static String shape(Field field, List<String> groups) {
        var context = field.semantic();
        var semantic = context == null ? "" : context.inputType() + ":" + context.inputMode() + ":" + context.autocomplete()
            + ":" + context.required() + ":" + context.multiple() + ":" + context.maxLength() + ":"
            + context.words().stream().distinct().sorted().toList() + ":"
            + (context.group() == null ? "" : groups.indexOf(context.group()) + ":" + context.row() + ":" + context.rows());
        return field.element() + ":" + field.control() + ":" + field.visibility() + ":" + field.disabled() + ":" + field.readonly()
            + ":" + field.inert() + ":" + field.options() + ":" + semantic;
    }

    private static boolean visible(Field field) { return "VISIBLE".equals(field.visibility()) && !field.disabled() && !field.inert(); }
    private static String name(Enum<?> value) { return value == null ? "null" : value.name(); }
}
