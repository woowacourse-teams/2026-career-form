package com.careerform.quality;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchedFieldAnalysis;
import com.careerform.formanalysis.infrastructure.adapter.ProviderSemanticSanitizer;

public final class QualityProjection {

    private QualityProjection() {
    }

    public record Field(String key, String position, String control, boolean mapped, boolean eligible) {
    }

    public record Snapshot(String snapshotKey, String host, String structureKey, List<Field> fields) {
        public Snapshot {
            fields = List.copyOf(fields);
        }

        public QualityMetrics.Counts counts() {
            return new QualityMetrics.Counts(fields.size(), fields.stream().filter(Field::mapped).count(),
                0, 0, 0, 0);
        }
    }

    public static Snapshot fields(FieldsAnalysisRequest request, FieldsAnalysisResponse response) {
        if (!request.snapshotId().equals(response.snapshotId())) {
            throw new IllegalArgumentException("관측 snapshot이 일치하지 않습니다");
        }
        var source = request.fieldCandidatesInTraversalOrder();
        var identities = source.stream().map(FieldCandidate::candidateId).toList();
        if (identities.stream().distinct().count() != identities.size()
            || response.fields().stream().anyMatch(field -> !identities.contains(field.candidateId()))) {
            throw new IllegalArgumentException("관측 후보 소속이 일치하지 않습니다");
        }
        var matched = response.fields().stream().filter(MatchedFieldAnalysis.class::isInstance)
            .map(MatchedFieldAnalysis.class::cast).collect(java.util.stream.Collectors.toUnmodifiableMap(MatchedFieldAnalysis::candidateId, field -> field));
        var shapes = shapes(request);
        var structure = digest("quality-structure-v1|" + String.join("|", shapes));
        var projected = IntStream.range(0, source.size()).mapToObj(index -> {
            var field = source.get(index);
            return new Field(digest(request.snapshotId() + "|" + field.candidateId()),
                Integer.toString(index), field.control().name(), matched.containsKey(field.candidateId()), eligible(field, matched.get(field.candidateId())));
        }).toList();
        return new Snapshot(digest(request.snapshotId()), request.site().host().toLowerCase(Locale.ROOT),
            structure, projected);
    }

    private static List<String> shapes(FieldsAnalysisRequest request) {
        var repeatGroups = request.fieldCandidatesInTraversalOrder().stream().filter(field -> field.semanticContext() != null && field.semanticContext().repeat() != null)
            .map(field -> field.semanticContext().repeat().groupId()).distinct().toList();
        var sections = request.sections();
        var sectionIds = sections.stream().map(FieldsAnalysisRequest.Section::sectionId).toList();
        return IntStream.range(0, sections.size()).boxed().flatMap(index -> {
            var section = sections.get(index);
            var parent = sectionIds.indexOf(section.parentSectionId());
            var header = "section:" + index + ":parent:" + parent;
            var fields = section.fields().stream().map(field -> shape(field, repeatGroups));
            var items = section.items() == null ? Stream.<String>empty()
                : IntStream.range(0, section.items().size()).boxed().flatMap(itemIndex -> {
                    var item = section.items().get(itemIndex);
                    return Stream.concat(Stream.of("item:" + itemIndex), item.fields().stream().map(field -> shape(field, repeatGroups)));
                });
            return Stream.concat(Stream.of(header), Stream.concat(fields, items));
        }).toList();
    }

    private static String shape(FieldCandidate field, List<String> repeatGroups) {
        var context = field.semanticContext();
        var semantic = "";
        if (context != null) {
            var labels = ProviderSemanticSanitizer.sanitizeFields(context.labels());
            var words = labels == null ? List.<String>of()
                : labels.stream().map(ProviderSemanticSanitizer.SafeLabel::text).distinct().sorted().toList();
            var repeat = context.repeat();
            semantic = context.inputType() + ":" + context.inputMode() + ":" + context.autocomplete()
                + ":" + Boolean.TRUE.equals(context.required()) + ":" + Boolean.TRUE.equals(context.multiple()) + ":" + context.maxLength()
                + ":" + words + ":" + (repeat == null ? "" : repeatGroups.indexOf(repeat.groupId()) + ":" + repeat.rowIndex() + ":" + repeat.rowCount());
        }
        return field.element() + ":" + field.control() + ":" + field.visibility()
            + ":" + Boolean.TRUE.equals(field.disabled()) + ":" + Boolean.TRUE.equals(field.readonly())
            + ":" + Boolean.TRUE.equals(field.inert()) + ":" + (field.options() == null ? 0 : field.options().size())
            + ":" + semantic;
    }

    private static boolean eligible(FieldCandidate field, MatchedFieldAnalysis analysis) {
        return field.visibility() == FieldsAnalysisRequest.Visibility.VISIBLE
            && !Boolean.TRUE.equals(field.disabled()) && !Boolean.TRUE.equals(field.inert())
            && analysis != null && analysis.interactionStatus() == FieldsAnalysisResponse.InteractionStatus.READY && analysis.writePlan() != null;
    }

    public static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("품질 식별 해시를 생성할 수 없습니다", exception);
        }
    }
}
