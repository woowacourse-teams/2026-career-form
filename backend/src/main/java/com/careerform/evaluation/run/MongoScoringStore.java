package com.careerform.evaluation.run;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.careerform.evaluation.scoring.RunAggregate;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Indexes;
import com.mongodb.client.model.Sorts;
import tools.jackson.databind.json.JsonMapper;

/** Mongo 재채점 이력 저장소. 집계는 JSON 그대로 둔다. */
public final class MongoScoringStore implements ScoringStore {

    static final String SCORINGS = "evaluation_scorings";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final MongoTemplate mongo;

    public MongoScoringStore(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    private final java.util.concurrent.atomic.AtomicBoolean indexed = new java.util.concurrent.atomic.AtomicBoolean();

    /** 색인을 만든다. 저장소를 처음 쓸 때 한 번 자동으로 부르며, 실패하면 그 연산도 실패한다. */
    public void ensureIndexes() {
        mongo.getCollection(SCORINGS).createIndex(Indexes.ascending("runId", "createdAt"));
        indexed.set(true);
    }

    @Override
    public void append(Scoring scoring) {
        scorings().insertOne(new Document("_id", scoring.id()).append("runId", scoring.runId())
            .append("scoringVersion", scoring.scoringVersion()).append("datasetDigest", scoring.datasetDigest())
            .append("createdBy", scoring.createdBy()).append("createdAt", Date.from(scoring.createdAt()))
            .append("aggregate", JSON.writeValueAsString(scoring.aggregate())));
    }

    @Override
    public List<Scoring> list(String runId) {
        List<Scoring> list = new ArrayList<>();
        scorings().find(Filters.eq("runId", runId)).sort(Sorts.ascending("createdAt", "_id")).forEach(document ->
            list.add(new Scoring(document.getString("_id"), runId, document.getString("scoringVersion"),
                document.getString("datasetDigest"), document.getString("createdBy"),
                document.getDate("createdAt").toInstant(),
                JSON.readValue(document.getString("aggregate"), RunAggregate.class))));
        return list;
    }

    private MongoCollection<Document> scorings() {
        if (!indexed.get()) {
            ensureIndexes();
        }
        return mongo.getCollection(SCORINGS);
    }
}
