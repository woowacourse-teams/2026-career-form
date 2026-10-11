package com.careerform.quality;

import java.time.Instant;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public final class QualityCorrespondence {
    private QualityCorrespondence() { }

    public static QualityCollectionService.Run apply(QualityCollectionService.Run run, String snapshotId, Map<String, String> identities, Instant now) {
        if (identities.isEmpty()) { return run; }
        if (snapshotId == null || identities.size() > 2000 || identities.values().stream().distinct().count() != identities.size()
            || identities.values().stream().anyMatch(value -> value.length() > 2048 || !value.matches("e[1-9][0-9]{0,7}(?:\\.e[1-9][0-9]{0,7}){0,99}"))) {
            throw new IllegalArgumentException("Invalid local control correspondence");
        }
        var snapshot = QualityProjection.digest(snapshotId);
        var original = run.snapshots().get(snapshot);
        var hashes = identities.entrySet().stream().collect(Collectors.toUnmodifiableMap(entry -> QualityProjection.digest(snapshotId + "|" + entry.getKey()), Map.Entry::getValue));
        if (original == null || !original.aliases().keySet().equals(hashes.keySet())) { throw new IllegalArgumentException("Invalid correspondence membership"); }
        var aliases = hashes.entrySet().stream().collect(Collectors.toUnmodifiableMap(Map.Entry::getKey,
            entry -> QualityProjection.digest(original.group().toString()) + ":control:" + QualityProjection.digest(entry.getValue())));
        if (original.identityVerified()) {
            if (!original.aliases().equals(aliases)) { throw new IllegalArgumentException("Control correspondence changed"); }
            return run;
        }
        var controls = aliases.entrySet().stream().collect(Collectors.toUnmodifiableMap(Map.Entry::getValue,
            entry -> original.controls().get(original.aliases().get(entry.getKey()))));
        var translated = aliases.entrySet().stream().collect(Collectors.toUnmodifiableMap(Map.Entry::getValue, entry -> {
            var source = run.execution().fields().get(original.aliases().get(entry.getKey()));
            var existing = run.execution().fields().get(entry.getValue());
            return existing == null ? source : merge(existing, source);
        }));
        var link = new QualityCollectionService.SnapshotLink(original.group(), aliases, controls, true);
        var snapshots = Stream.concat(run.snapshots().entrySet().stream().filter(entry -> !entry.getKey().equals(snapshot)), Stream.of(Map.entry(snapshot, link)))
            .collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
        var referenced = snapshots.values().stream().flatMap(value -> value.aliases().values().stream()).collect(Collectors.toUnmodifiableSet());
        var fields = Stream.concat(run.execution().fields().entrySet().stream().filter(entry -> referenced.contains(entry.getKey()) && !translated.containsKey(entry.getKey())),
            translated.entrySet().stream()).collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
        return new QualityCollectionService.Run(run.tokenHash(), new QualityExecution(run.execution().startedAt(), now, fields, run.execution().events(), run.execution().terminal()),
            snapshots, snapshots.values().stream().map(value -> value.group().structure()).distinct().count() > 1);
    }

    private static QualityExecution.Field merge(QualityExecution.Field first, QualityExecution.Field second) {
        if (!second.observed()) { return new QualityExecution.Field(first.mapped() || second.mapped(), first.eligible() || second.eligible(), first.progress(), first.observed()); }
        if (!first.observed()) { return new QualityExecution.Field(first.mapped() || second.mapped(), first.eligible() || second.eligible(), second.progress(), true); }
        var a = first.progress();
        var b = second.progress();
        var retained = a.retained() || b.retained();
        var written = a.written() || b.written();
        var attempted = a.attempted() || b.attempted();
        var reason = retained ? null : written ? b.written() ? b.reason() : a.reason() : attempted ? b.attempted() ? b.reason() : a.reason() : b.reason();
        return new QualityExecution.Field(first.mapped() || second.mapped(), first.eligible() || second.eligible(),
            new QualityExecution.ClientState(a.bound() || b.bound(), attempted, written, retained, reason), true);
    }
}
