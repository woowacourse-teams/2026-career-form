package com.careerform.evaluation.provider;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;

import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiChoiceModel;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Indexes;
import com.mongodb.client.model.ReplaceOptions;
import com.mongodb.client.model.Sorts;

/** Mongo 평가 공급자 등록 저장소. 등록은 이름을 _id로, 변경 기록은 덧붙이기만 한다. 키 원문은 저장하지 않는다. */
public final class MongoProviderRegistrationStore implements ProviderRegistrationStore {

    static final String REGISTRATIONS = "evaluation_provider_registrations";
    static final String CHANGES = "evaluation_provider_changes";
    private final MongoTemplate mongo;
    private final AtomicBoolean indexed = new AtomicBoolean();

    public MongoProviderRegistrationStore(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    @Override
    public Optional<ProviderRegistration> find(String name) {
        return Optional.ofNullable(registrations().find(Filters.eq("_id", name)).first()).map(this::registration);
    }

    @Override
    public List<ProviderRegistration> list() {
        List<ProviderRegistration> list = new ArrayList<>();
        registrations().find().sort(Sorts.ascending("_id")).forEach(document -> list.add(registration(document)));
        return list;
    }

    @Override
    public void save(ProviderRegistration registration) {
        Document document = new Document("_id", registration.name()).append("baseUrl", registration.baseUrl())
            .append("keyName", registration.keyName()).append("models", registration.models())
            .append("format", registration.format().name()).append("reasoningEffort", registration.reasoningEffort())
            .append("timeoutMs", registration.timeoutMs()).append("minConfidence", registration.minConfidence())
            .append("enabled", registration.enabled()).append("updatedBy", registration.updatedBy())
            .append("updatedAt", Date.from(registration.updatedAt()));
        registrations().replaceOne(Filters.eq("_id", registration.name()), document, new ReplaceOptions().upsert(true));
    }

    @Override
    public void appendChange(ProviderChange change) {
        changes().insertOne(new Document("name", change.name()).append("action", change.action().name())
            .append("by", change.by()).append("at", Date.from(change.at())).append("summary", change.summary()));
    }

    @Override
    public List<ProviderChange> changes(String name) {
        List<ProviderChange> list = new ArrayList<>();
        changes().find(Filters.eq("name", name)).sort(Sorts.ascending("at", "_id")).forEach(document ->
            list.add(new ProviderChange(name, ProviderChange.Action.valueOf(document.getString("action")),
                document.getString("by"), document.getDate("at").toInstant(), document.getString("summary"))));
        return list;
    }

    private ProviderRegistration registration(Document document) {
        return new ProviderRegistration(document.getString("_id"), document.getString("baseUrl"),
            document.getString("keyName"), document.getList("models", String.class),
            OpenAiChoiceModel.ResponseFormat.valueOf(document.getString("format")),
            document.getString("reasoningEffort"), document.getInteger("timeoutMs"),
            document.getDouble("minConfidence"), document.getBoolean("enabled"), document.getString("updatedBy"),
            document.getDate("updatedAt").toInstant());
    }

    private MongoCollection<Document> registrations() {
        ensureIndexes();
        return mongo.getCollection(REGISTRATIONS);
    }

    private MongoCollection<Document> changes() {
        ensureIndexes();
        return mongo.getCollection(CHANGES);
    }

    private void ensureIndexes() {
        if (indexed.compareAndSet(false, true)) {
            mongo.getCollection(CHANGES).createIndex(Indexes.ascending("name", "at"));
        }
    }
}
