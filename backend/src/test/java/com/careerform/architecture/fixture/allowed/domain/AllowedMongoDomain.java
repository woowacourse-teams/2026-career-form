package com.careerform.architecture.fixture.allowed.domain;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("allowed_domains")
public record AllowedMongoDomain(@Id String id) {
}
