package com.careerform.quality;

import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public record QualityExecution(
    Instant startedAt,
    Instant lastObservedAt,
    Map<String, Field> fields,
    Set<String> events,
    Status terminal
) {

    public QualityExecution {
        fields = Map.copyOf(fields);
        events = Set.copyOf(events);
    }

    public enum Status {
        RUNNING,
        COMPLETED,
        CANCELLED,
        UNOBSERVED
    }

    public enum Reason {
        NOT_MAPPED,
        NOT_APPROVED,
        PROFILE_VALUE_MISSING,
        EXISTING_VALUE_PROTECTED,
        UNSUPPORTED_CONTROL,
        UNSUPPORTED_FORMAT,
        STALE_TARGET,
        CONFLICT,
        EXECUTION_FAILED,
        RETENTION_UNOBSERVED,
        RETENTION_LOST,
        CANCELLED,
        UNCLASSIFIED
    }

    public record ClientState(boolean bound, boolean attempted, boolean written, boolean retained, Reason reason) {
        public ClientState {
            if ((attempted && !bound) || (written && !attempted) || (retained && !written)) {
                throw new IllegalArgumentException("보고한 입력 단계의 순서가 맞지 않습니다");
            }
            if ((reason == Reason.EXECUTION_FAILED && (!attempted || written))
                || ((reason == Reason.RETENTION_LOST || reason == Reason.RETENTION_UNOBSERVED) && (!written || retained))
                || (reason == Reason.PROFILE_VALUE_MISSING && bound)
                || ((reason == Reason.NOT_APPROVED || reason == Reason.EXISTING_VALUE_PROTECTED) && attempted)
                || (reason == Reason.NOT_MAPPED && bound)) {
                throw new IllegalArgumentException("보고한 사유와 입력 단계가 맞지 않습니다");
            }
        }

        public ClientState merge(ClientState other) {
            return new ClientState(bound || other.bound, attempted || other.attempted,
                written || other.written, retained || other.retained,
                other.rank() >= rank() ? other.reason : reason);
        }

        private int rank() {
            return retained ? 4 : written ? 3 : attempted ? 2 : bound ? 1 : 0;
        }
    }

    public record Field(boolean mapped, boolean eligible, ClientState progress, boolean observed) {
        public Field(boolean mapped, boolean eligible, ClientState progress) {
            this(mapped, eligible, progress, progress != null);
        }

        public Field {
            progress = progress == null ? new ClientState(false, false, false, false, null) : progress;
            if ((!mapped && progress.bound) || (!eligible && progress.attempted)) {
                throw new IllegalArgumentException("보고한 입력 단계가 서버 관측 범위를 벗어났습니다");
            }
        }

        public Field merge(ClientState incoming) {
            return new Field(mapped, eligible, progress.merge(incoming), true);
        }
    }

    public static QualityExecution start(Instant startedAt, Map<String, Field> fields) {
        return new QualityExecution(startedAt, startedAt, fields, Set.of(), null);
    }

    public QualityExecution report(String eventId, Map<String, ClientState> updates, Status finished, Instant now) {
        if (eventId == null || !eventId.matches("[A-Za-z0-9_-]{1,128}")
            || !QualityRetention.reportAllowed(startedAt, now)
            || (finished != null && finished != Status.COMPLETED && finished != Status.CANCELLED)) {
            throw new IllegalArgumentException("실행 결과 보고를 확인할 수 없습니다");
        }
        var key = QualityProjection.digest(eventId);
        if (events.contains(key)) {
            return this;
        }
        var checked = Map.copyOf(updates);
        if (events.size() >= 200 || checked.size() > 2000 || !fields.keySet().containsAll(checked.keySet())) {
            throw new IllegalArgumentException("실행 결과 보고의 범위 또는 횟수를 초과했습니다");
        }
        var next = fields.entrySet().stream().collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, entry -> {
            var update = checked.get(entry.getKey());
            return update == null ? entry.getValue() : entry.getValue().merge(update);
        }));
        return new QualityExecution(startedAt, now.isAfter(lastObservedAt) ? now : lastObservedAt,
            next, Stream.concat(events.stream(), Stream.of(key)).collect(Collectors.toUnmodifiableSet()),
            terminal == null ? finished : terminal);
    }

    public QualityMetrics.Counts counts() {
        return new QualityMetrics.Counts(fields.size(), fields.values().stream().filter(Field::mapped).count(),
            fields.values().stream().filter(field -> field.progress.bound).count(),
            fields.values().stream().filter(field -> field.progress.attempted).count(),
            fields.values().stream().filter(field -> field.progress.written).count(),
            fields.values().stream().filter(field -> field.progress.retained).count());
    }

    public Status status(Instant now) {
        return terminal != null ? terminal
            : QualityRetention.provisionallyUnobserved(lastObservedAt, now) ? Status.UNOBSERVED : Status.RUNNING;
    }

    public QualityMetrics.Counts reportedCounts() {
        return new QualityExecution(startedAt, lastObservedAt, fields.entrySet().stream()
            .filter(entry -> entry.getValue().observed()).collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue)), events, terminal).counts();
    }
}
