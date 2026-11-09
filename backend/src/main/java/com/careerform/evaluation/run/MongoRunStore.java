package com.careerform.evaluation.run;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Optional;
import java.util.TreeMap;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.careerform.evaluation.prompt.PromptSnapshot;
import com.mongodb.ErrorCategory;
import com.mongodb.MongoWriteException;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.Indexes;
import com.mongodb.client.model.Sorts;
import com.mongodb.client.model.Updates;

/**
 * Mongo 실행 저장소. 진행 중 실행만 {@code activeSlot} 필드를 가지며 그 필드의 부분 고유 색인으로
 * 진행 중 실행이 하나뿐임을 DB가 보장한다. 프롬프트 스냅샷은 해시를 키로 한 번만 저장한다.
 */
public final class MongoRunStore implements RunStore {

    static final String RUNS = "evaluation_runs";
    static final String PROMPTS = "evaluation_prompt_snapshots";
    private static final String ACTIVE = "ACTIVE";

    private final MongoTemplate mongo;

    public MongoRunStore(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    private final java.util.concurrent.atomic.AtomicBoolean indexed = new java.util.concurrent.atomic.AtomicBoolean();

    /** 색인을 만든다. 저장소를 처음 쓸 때 한 번 자동으로 부르며, 실패하면 그 연산도 실패한다. */
    public void ensureIndexes() {
        mongo.getCollection(RUNS).createIndex(Indexes.ascending("activeSlot"),
            new IndexOptions().unique(true).partialFilterExpression(Filters.exists("activeSlot")));
        mongo.getCollection(RUNS).createIndex(Indexes.descending("requestedAt"));
        indexed.set(true);
    }

    @Override
    public Registration register(EvaluationRun run) {
        Document running = runs().find(Filters.exists("activeSlot")).first();
        Document pending = running != null ? running : oldestWaiting();
        if (pending != null) {
            return new Registration(null, fromDocument(pending));
        }
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                runs().insertOne(toDocument(run));
                return new Registration(run, null);
            }
            catch (MongoWriteException exception) {
                if (!duplicate(exception)) {
                    throw exception;
                }
                Document active = runs().find(Filters.exists("activeSlot")).first();
                if (active != null) {
                    return new Registration(null, fromDocument(active));
                }
            }
        }
        throw new IllegalStateException("평가 실행 등록이 반복 충돌했습니다");
    }

    @Override
    public Registration registerComparison(List<EvaluationRun> comparison) {
        Registration first = register(comparison.getFirst());
        if (first.registered() == null) {
            return first;
        }
        List<Document> rest = new ArrayList<>();
        for (int index = 1; index < comparison.size(); index++) {
            rest.add(toDocument(comparison.get(index).waiting(), index));
        }
        if (!rest.isEmpty()) {
            runs().insertMany(rest);
        }
        return first;
    }

    @Override
    public List<EvaluationRun> comparison(String comparisonId) {
        List<EvaluationRun> found = new ArrayList<>();
        runs().find(Filters.eq("comparisonId", comparisonId)).sort(Sorts.ascending("comparisonOrder"))
            .forEach(document -> found.add(fromDocument(document)));
        return found;
    }

    @Override
    public boolean promoteWaiting() {
        if (runs().find(Filters.exists("activeSlot")).first() != null) {
            return false;
        }
        Document next = oldestWaiting();
        if (next == null) {
            return false;
        }
        try {
            return runs().updateOne(Filters.and(Filters.eq("_id", next.getString("_id")),
                    Filters.eq("status", RunStatus.WAITING.name())),
                Updates.combine(Updates.set("status", RunStatus.QUEUED.name()), Updates.set("activeSlot", ACTIVE)))
                .getModifiedCount() == 1;
        }
        catch (MongoWriteException exception) {
            if (!duplicate(exception)) {
                throw exception;
            }
            return false;
        }
    }

    private Document oldestWaiting() {
        return runs().find(Filters.eq("status", RunStatus.WAITING.name()))
            .sort(Sorts.ascending("requestedAt", "comparisonOrder")).first();
    }

    @Override
    public int deleteFinished(java.util.Collection<String> runIds) {
        List<String> finished = java.util.Arrays.stream(RunStatus.values()).filter(status -> !status.pending())
            .map(Enum::name).toList();
        return (int) runs().deleteMany(Filters.and(Filters.in("_id", runIds), Filters.in("status", finished)))
            .getDeletedCount();
    }

    @Override
    public Optional<EvaluationRun> find(String runId) {
        return Optional.ofNullable(runs().find(Filters.eq("_id", runId)).first()).map(MongoRunStore::fromDocument);
    }

    @Override
    public boolean transition(String runId, RunStatus from, RunStatus to, Instant at) {
        if (!from.canMoveTo(to)) {
            return false;
        }
        List<Bson> updates = new ArrayList<>();
        updates.add(Updates.set("status", to.name()));
        if (to == RunStatus.RUNNING) {
            updates.add(Updates.set("startedAt", Date.from(at)));
        }
        if (from == RunStatus.WAITING && to.active()) {
            updates.add(Updates.set("activeSlot", ACTIVE));
        }
        if (!to.active()) {
            updates.add(Updates.set("finishedAt", Date.from(at)));
            updates.add(Updates.unset("activeSlot"));
            updates.add(Updates.unset("leaseOwner"));
            updates.add(Updates.unset("leaseUntil"));
        }
        try {
            return runs().updateOne(Filters.and(Filters.eq("_id", runId), Filters.eq("status", from.name())),
                Updates.combine(updates)).getModifiedCount() == 1;
        }
        catch (MongoWriteException exception) {
            if (!duplicate(exception)) {
                throw exception;
            }
            return false;
        }
    }

    @Override
    public boolean requestCancel(String runId) {
        return runs().updateOne(Filters.and(Filters.eq("_id", runId), Filters.eq("status", RunStatus.RUNNING.name())),
            Updates.set("cancelRequested", true)).getMatchedCount() == 1;
    }

    @Override
    public List<EvaluationRun> recent(int limit) {
        List<EvaluationRun> recent = new ArrayList<>();
        runs().find().sort(com.mongodb.client.model.Sorts.descending("requestedAt")).limit(Math.max(0, limit))
            .forEach(document -> recent.add(fromDocument(document)));
        return recent;
    }

    @Override
    public Optional<EvaluationRun> claim(String owner, Instant now, java.time.Duration lease) {
        Bson claimable = Filters.and(Filters.exists("activeSlot"), Filters.or(
            Filters.eq("status", RunStatus.QUEUED.name()),
            Filters.and(Filters.eq("status", RunStatus.RUNNING.name()),
                Filters.or(Filters.eq("leaseUntil", null), Filters.lte("leaseUntil", Date.from(now))))));
        Document current = runs().find(claimable).first();
        if (current == null) {
            return Optional.empty();
        }
        List<Bson> updates = new ArrayList<>(List.of(Updates.set("status", RunStatus.RUNNING.name()),
            Updates.set("leaseOwner", owner), Updates.set("leaseUntil", Date.from(now.plus(lease)))));
        if (current.getDate("startedAt") == null) {
            updates.add(Updates.set("startedAt", Date.from(now)));
        }
        Bson sameState = Filters.and(Filters.eq("_id", current.getString("_id")),
            Filters.eq("status", current.getString("status")), Filters.eq("leaseUntil", current.getDate("leaseUntil")));
        if (runs().updateOne(sameState, Updates.combine(updates)).getModifiedCount() != 1) {
            return Optional.empty();
        }
        return find(current.getString("_id"));
    }

    @Override
    public boolean renew(String runId, String owner, Instant until, int processedCalls) {
        return runs().updateOne(Filters.and(Filters.eq("_id", runId), Filters.eq("status", RunStatus.RUNNING.name()),
                Filters.eq("leaseOwner", owner)),
            Updates.combine(Updates.set("leaseUntil", Date.from(until)), Updates.set("processedCalls", processedCalls)))
            .getMatchedCount() == 1;
    }

    @Override
    public boolean finish(String runId, String owner, RunStatus to, Instant at) {
        if (!RunStatus.RUNNING.canMoveTo(to)) {
            return false;
        }
        return runs().updateOne(Filters.and(Filters.eq("_id", runId), Filters.eq("status", RunStatus.RUNNING.name()),
                Filters.eq("leaseOwner", owner)),
            Updates.combine(Updates.set("status", to.name()), Updates.set("finishedAt", Date.from(at)),
                Updates.unset("activeSlot"), Updates.unset("leaseOwner"), Updates.unset("leaseUntil")))
            .getModifiedCount() == 1;
    }

    @Override
    public void savePromptSnapshotIfAbsent(PromptSnapshot snapshot) {
        List<Document> parts = new ArrayList<>();
        snapshot.parts().forEach((name, text) -> parts.add(new Document("name", name).append("text", text)));
        try {
            prompts().insertOne(new Document("_id", snapshot.digest()).append("parts", parts));
        }
        catch (MongoWriteException exception) {
            if (!duplicate(exception)) {
                throw exception;
            }
        }
    }

    @Override
    public Optional<PromptSnapshot> findPromptSnapshot(String digest) {
        Document document = prompts().find(Filters.eq("_id", digest)).first();
        if (document == null) {
            return Optional.empty();
        }
        TreeMap<String, String> parts = new TreeMap<>();
        document.getList("parts", Document.class).forEach(part -> parts.put(part.getString("name"), part.getString("text")));
        return Optional.of(new PromptSnapshot(digest, parts));
    }

    private MongoCollection<Document> runs() {
        if (!indexed.get()) {
            ensureIndexes();
        }
        return mongo.getCollection(RUNS);
    }

    private MongoCollection<Document> prompts() {
        if (!indexed.get()) {
            ensureIndexes();
        }
        return mongo.getCollection(PROMPTS);
    }

    private static boolean duplicate(MongoWriteException exception) {
        return exception.getError().getCategory() == ErrorCategory.DUPLICATE_KEY;
    }

    private static Document toDocument(EvaluationRun run) {
        return toDocument(run, 0);
    }

    private static Document toDocument(EvaluationRun run, int comparisonOrder) {
        RunVersions versions = run.versions();
        Document settings = new Document();
        versions.settings().forEach(settings::append);
        Document document = new Document("_id", run.id())
            .append("fingerprint", run.fingerprint())
            .append("versions", new Document("datasetId", versions.datasetId())
                .append("datasetVersion", versions.datasetVersion())
                .append("datasetDigest", versions.datasetDigest())
                .append("split", versions.split())
                .append("promptDigest", versions.promptDigest())
                .append("promptVersion", versions.promptVersion())
                .append("codeVersion", versions.codeVersion())
                .append("provider", versions.provider())
                .append("model", versions.model())
                .append("scoringVersion", versions.scoringVersion())
                .append("settings", settings)
                .append("inputs", new Document(versions.inputs())))
            .append("repetitions", run.repetitions())
            .append("plannedCalls", run.plannedCalls())
            .append("estimatedModelCalls", run.estimatedModelCalls())
            .append("requestedBy", run.requestedBy())
            .append("requestedAt", Date.from(run.requestedAt()))
            .append("status", run.status().name())
            .append("startedAt", date(run.startedAt()))
            .append("finishedAt", date(run.finishedAt()))
            .append("processedCalls", run.processedCalls())
            .append("cancelRequested", run.cancelRequested())
            .append("leaseOwner", run.leaseOwner())
            .append("leaseUntil", date(run.leaseUntil()))
            .append("comparisonId", run.comparisonId())
            .append("comparisonOrder", comparisonOrder);
        if (run.status().active()) {
            document.append("activeSlot", ACTIVE);
        }
        return document;
    }

    static EvaluationRun fromDocument(Document document) {
        Document versions = document.get("versions", Document.class);
        TreeMap<String, String> settings = new TreeMap<>();
        versions.get("settings", Document.class).forEach((key, value) -> settings.put(key, (String) value));
        // 자동 평가 입력 지문이 생기기 전 기록에는 이 값이 없다.
        TreeMap<String, String> inputs = new TreeMap<>();
        Document storedInputs = versions.get("inputs", Document.class);
        if (storedInputs != null) {
            storedInputs.forEach((key, value) -> inputs.put(key, (String) value));
        }
        RunVersions runVersions = new RunVersions(versions.getString("datasetId"), versions.getInteger("datasetVersion"),
            versions.getString("datasetDigest"), versions.getString("split"), versions.getString("promptDigest"),
            versions.getString("promptVersion"), versions.getString("codeVersion"), versions.getString("provider"),
            versions.getString("model"), versions.getString("scoringVersion"), settings, inputs);
        return new EvaluationRun(document.getString("_id"), document.getString("fingerprint"), runVersions,
            document.getInteger("repetitions"), document.getInteger("plannedCalls"),
            document.getInteger("estimatedModelCalls"), document.getString("requestedBy"),
            instant(document.getDate("requestedAt")), RunStatus.valueOf(document.getString("status")),
            instant(document.getDate("startedAt")), instant(document.getDate("finishedAt")),
            document.getInteger("processedCalls"), document.getBoolean("cancelRequested"),
            document.getString("leaseOwner"), instant(document.getDate("leaseUntil")),
            document.getString("comparisonId"));
    }

    private static Date date(Instant instant) {
        return instant == null ? null : Date.from(instant);
    }

    private static Instant instant(Date date) {
        return date == null ? null : date.toInstant();
    }
}
