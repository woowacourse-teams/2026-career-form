package com.careerform.evaluation.run;

import java.time.Clock;
import java.util.Collection;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.ReplaceOptions;

/** Mongo 기록 메모 저장소. 문서 하나가 기록 하나의 메모이고 {@code _id}가 기록 키다. */
public final class MongoRecordNoteStore implements RecordNoteStore {

    static final String NOTES = "evaluation_record_notes";
    private final MongoTemplate mongo;
    private final Clock clock;

    public MongoRecordNoteStore(MongoTemplate mongo, Clock clock) {
        this.mongo = mongo;
        this.clock = clock;
    }

    @Override
    public Map<String, String> all() {
        Map<String, String> notes = new LinkedHashMap<>();
        mongo.getCollection(NOTES).find().forEach(document -> notes.put(document.getString("_id"), document.getString("note")));
        return notes;
    }

    @Override
    public void save(String recordKey, String note, String updatedBy) {
        mongo.getCollection(NOTES).replaceOne(Filters.eq("_id", recordKey), new Document("_id", recordKey)
            .append("note", note).append("updatedBy", updatedBy).append("updatedAt", Date.from(clock.instant())),
            new ReplaceOptions().upsert(true));
    }

    @Override
    public void delete(Collection<String> recordKeys) {
        mongo.getCollection(NOTES).deleteMany(Filters.in("_id", recordKeys));
    }
}
