package com.careerform.quality;

import java.util.concurrent.TimeUnit;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.mongodb.client.MongoDatabase;

public class QualityMongoTemplate extends MongoTemplate {
    private final long timeoutMs;

    public QualityMongoTemplate(MongoTemplate original, long timeoutMs) {
        super(original.getMongoDatabaseFactory(), original.getConverter());
        if (timeoutMs < 1) { throw new IllegalArgumentException("Invalid quality database timeout"); }
        this.timeoutMs = timeoutMs;
    }

    @Override
    protected MongoDatabase doGetDatabase() { return super.doGetDatabase().withTimeout(timeoutMs, TimeUnit.MILLISECONDS); }
}
