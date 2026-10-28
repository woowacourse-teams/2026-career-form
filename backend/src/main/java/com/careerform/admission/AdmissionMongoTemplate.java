package com.careerform.admission;

import java.util.concurrent.TimeUnit;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.mongodb.client.MongoDatabase;

public final class AdmissionMongoTemplate extends MongoTemplate {
    public AdmissionMongoTemplate(MongoTemplate original) { super(original.getMongoDatabaseFactory(), original.getConverter()); }
    @Override protected MongoDatabase doGetDatabase() {
        var context = AnalysisContext.currentOrNull();
        var timeout = context == null ? 2000 : context.timeoutMillis(2000);
        return super.doGetDatabase().withTimeout(timeout, TimeUnit.MILLISECONDS);
    }
}
