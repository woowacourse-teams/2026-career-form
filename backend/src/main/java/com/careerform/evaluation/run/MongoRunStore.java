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

    public void ensureIndexes() {
        runs().createIndex(Indexes.ascending("activeSlot"),
            new IndexOptions().unique(true).partialFilterExpression(Filters.exists("activeSlot")));
        runs().createIndex(Indexes.descending("requestedAt"));
    }

    @Override
    public Registration register(EvaluationRun run) {
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
        if (!to.active()) {
            updates.add(Updates.set("finishedAt", Date.from(at)));
            updates.add(Updates.unset("activeSlot"));
        }
        return runs().updateOne(Filters.and(Filters.eq("_id", runId), Filters.eq("status", from.name())),
            Updates.combine(updates)).getModifiedCount() == 1;
    }

    @Override
    public boolean requestCancel(String runId) {
        return runs().updateOne(Filters.and(Filters.eq("_id", runId), Filters.eq("status", RunStatus.RUNNING.name())),
            Updates.set("cancelRequested", true)).getMatchedCount() == 1;
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
        return mongo.getCollection(RUNS);
    }

    private MongoCollection<Document> prompts() {
        return mongo.getCollection(PROMPTS);
    }

    private static boolean duplicate(MongoWriteException exception) {
        return exception.getError().getCategory() == ErrorCategory.DUPLICATE_KEY;
    }

    private static Document toDocument(EvaluationRun run) {
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
                .append("settings", settings))
            .append("repetitions", run.repetitions())
            .append("plannedCalls", run.plannedCalls())
            .append("estimatedModelCalls", run.estimatedModelCalls())
            .append("requestedBy", run.requestedBy())
            .append("requestedAt", Date.from(run.requestedAt()))
            .append("status", run.status().name())
            .append("startedAt", date(run.startedAt()))
            .append("finishedAt", date(run.finishedAt()))
            .append("processedCalls", run.processedCalls())
            .append("cancelRequested", run.cancelRequested());
        if (run.status().active()) {
            document.append("activeSlot", ACTIVE);
        }
        return document;
    }

    private static EvaluationRun fromDocument(Document document) {
        Document versions = document.get("versions", Document.class);
        TreeMap<String, String> settings = new TreeMap<>();
        versions.get("settings", Document.class).forEach((key, value) -> settings.put(key, (String) value));
        RunVersions runVersions = new RunVersions(versions.getString("datasetId"), versions.getInteger("datasetVersion"),
            versions.getString("datasetDigest"), versions.getString("split"), versions.getString("promptDigest"),
            versions.getString("promptVersion"), versions.getString("codeVersion"), versions.getString("provider"),
            versions.getString("model"), versions.getString("scoringVersion"), settings);
        return new EvaluationRun(document.getString("_id"), document.getString("fingerprint"), runVersions,
            document.getInteger("repetitions"), document.getInteger("plannedCalls"),
            document.getInteger("estimatedModelCalls"), document.getString("requestedBy"),
            instant(document.getDate("requestedAt")), RunStatus.valueOf(document.getString("status")),
            instant(document.getDate("startedAt")), instant(document.getDate("finishedAt")),
            document.getInteger("processedCalls"), document.getBoolean("cancelRequested"));
    }

    private static Date date(Instant instant) {
        return instant == null ? null : Date.from(instant);
    }

    private static Instant instant(Date date) {
        return date == null ? null : date.toInstant();
    }
}
