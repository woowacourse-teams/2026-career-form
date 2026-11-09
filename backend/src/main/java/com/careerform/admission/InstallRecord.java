package com.careerform.admission;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("analysis_installations")
public record InstallRecord(@Id String id, String keyHash, String tokenHash, String replay, Instant completedAt, boolean revoked) {
    @Override public String toString() { return "InstallRecord[redacted]"; }
}
