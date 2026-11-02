package com.careerform.evaluation.run;

import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.evaluation.scoring.AutofillCounts;
import com.careerform.evaluation.scoring.CallScore;
import com.careerform.evaluation.scoring.FailureKind;
import com.careerform.evaluation.scoring.ObservedItem;
import com.careerform.monitoring.ModelCallRecording.Attempt;
import com.careerform.monitoring.ModelCallRecording.Outcome;
import com.mongodb.ErrorCategory;
import com.mongodb.MongoWriteException;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.Indexes;
import com.mongodb.client.model.Sorts;

/** Mongo 결과 저장소. (실행, 반복, 사례, 순서) 고유 색인으로 같은 호출을 두 번 저장하지 않는다. */
public final class MongoResultStore implements ResultStore {

    static final String RESULTS = "evaluation_call_results";
    private final MongoTemplate mongo;

    public MongoResultStore(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    private final java.util.concurrent.atomic.AtomicBoolean indexed = new java.util.concurrent.atomic.AtomicBoolean();

    /** 색인을 만든다. 저장소를 처음 쓸 때 한 번 자동으로 부르며, 실패하면 그 연산도 실패한다. */
    public void ensureIndexes() {
        mongo.getCollection(RESULTS).createIndex(Indexes.ascending("runId", "repetition", "caseId", "order"),
            new IndexOptions().unique(true));
        mongo.getCollection(RESULTS).createIndex(Indexes.ascending("runId", "sequence"));
        indexed.set(true);
    }

    @Override
    public boolean append(CallResultRecord record) {
        try {
            long sequence = results().countDocuments(Filters.eq("runId", record.runId()));
            results().insertOne(toDocument(record).append("sequence", sequence));
            return true;
        }
        catch (MongoWriteException exception) {
            if (exception.getError().getCategory() == ErrorCategory.DUPLICATE_KEY) {
                return false;
            }
            throw exception;
        }
    }

    @Override
    public List<CallResultRecord> list(String runId) {
        List<CallResultRecord> records = new ArrayList<>();
        results().find(Filters.eq("runId", runId)).sort(Sorts.ascending("sequence", "recordedAt"))
            .forEach(document -> records.add(fromDocument(document)));
        return records;
    }

    private MongoCollection<Document> results() {
        if (!indexed.get()) {
            ensureIndexes();
        }
        return mongo.getCollection(RESULTS);
    }

    private static Document toDocument(CallResultRecord record) {
        List<Document> observed = new ArrayList<>();
        record.observed().forEach((id, item) -> observed.add(new Document("id", id).append("value", item.value())
            .append("unavailable", item.providerUnavailable()).append("confidence", item.confidence())));
        List<Document> attempts = new ArrayList<>();
        for (Attempt attempt : record.attempts()) {
            attempts.add(new Document("provider", attempt.provider()).append("operation", attempt.operation())
                .append("durationNanos", attempt.durationNanos()).append("httpStatus", attempt.httpStatus())
                .append("outcome", attempt.outcome().name()).append("inputTokens", attempt.inputTokens())
                .append("outputTokens", attempt.outputTokens()).append("observedModel", attempt.observedModel()));
        }
        CallScore score = record.score();
        AutofillCounts autofill = record.autofill();
        return new Document("runId", record.runId()).append("repetition", record.repetition())
            .append("caseId", record.caseId()).append("order", record.order()).append("kind", record.kind().name())
            .append("stage", record.stage().name())
            .append("failure", record.failure() == null ? null : record.failure().name())
            .append("score", score == null ? null : new Document("correct", score.correct())
                .append("wrongKey", score.wrongKey()).append("missing", score.missing())
                .append("unnecessary", score.unnecessary()).append("excluded", score.excluded()))
            .append("observed", observed).append("productCallNanos", record.productCallNanos())
            .append("attempts", attempts).append("recordedAt", Date.from(record.recordedAt()))
            .append("autofill", autofill == null ? null : new Document("autoCorrect", autofill.autoCorrect())
                .append("autoWrong", autofill.autoWrong()).append("review", autofill.review())
                .append("blocked", autofill.blocked()).append("empty", autofill.empty())
                .append("unobserved", autofill.unobserved()));
    }

    private static CallResultRecord fromDocument(Document document) {
        Map<String, ObservedItem> observed = new LinkedHashMap<>();
        for (Document item : document.getList("observed", Document.class)) {
            observed.put(item.getString("id"), item.getBoolean("unavailable")
                ? ObservedItem.unavailable() : ObservedItem.answered(item.getString("value"), item.getDouble("confidence")));
        }
        List<Attempt> attempts = new ArrayList<>();
        for (Document attempt : document.getList("attempts", Document.class)) {
            attempts.add(new Attempt(attempt.getString("provider"), attempt.getString("operation"),
                attempt.getLong("durationNanos"), attempt.getInteger("httpStatus"),
                Outcome.valueOf(attempt.getString("outcome")), longOrNull(attempt.get("inputTokens")),
                longOrNull(attempt.get("outputTokens")), attempt.getString("observedModel")));
        }
        Document score = document.get("score", Document.class);
        String failure = document.getString("failure");
        return new CallResultRecord(document.getString("runId"), document.getInteger("repetition"),
            document.getString("caseId"), document.getInteger("order"), CallKind.valueOf(document.getString("kind")),
            CallKind.Stage.valueOf(document.getString("stage")), failure == null ? null : FailureKind.valueOf(failure),
            score == null ? null : new CallScore(score.getInteger("correct"), score.getInteger("wrongKey"),
                score.getInteger("missing"), score.getInteger("unnecessary"), score.getInteger("excluded")),
            observed, document.getLong("productCallNanos"), attempts, document.getDate("recordedAt").toInstant(),
            autofill(document.get("autofill", Document.class)));
    }

    private static AutofillCounts autofill(Document autofill) {
        return autofill == null ? null : new AutofillCounts(autofill.getInteger("autoCorrect"),
            autofill.getInteger("autoWrong"), autofill.getInteger("review"), autofill.getInteger("blocked"),
            autofill.getInteger("empty"), autofill.getInteger("unobserved"));
    }

    private static Long longOrNull(Object value) {
        return value == null ? null : ((Number) value).longValue();
    }
}
