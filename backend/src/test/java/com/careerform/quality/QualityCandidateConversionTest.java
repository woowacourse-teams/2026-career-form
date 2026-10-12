package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import java.time.Instant;
import java.util.List;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.springframework.data.mongodb.core.convert.MappingMongoConverter;
import org.springframework.data.mongodb.core.convert.NoOpDbRefResolver;
import org.springframework.data.mongodb.core.mapping.MongoMappingContext;

class QualityCandidateConversionTest {
    @Test
    void readsOldCandidatesAndRoundTripsObservedLinks() throws Exception {
        var context = new MongoMappingContext();
        context.setSimpleTypeHolder(org.springframework.data.mongodb.core.convert.MongoCustomConversions.create(adapter -> {}).getSimpleTypeHolder());
        context.afterPropertiesSet();
        var converter = new MappingMongoConverter(NoOpDbRefResolver.INSTANCE, context);
        converter.afterPropertiesSet();
        var at = Instant.parse("2030-01-01T00:00:00Z");
        var old = new QualityRegistry.Candidate("fixture", "https://fixture.test/", null, at, at, QualityRegistry.Status.CLAIMED,
            false, false, "owner", "합성 담당자", at.plusSeconds(86400), null, null, List.of());
        var document = new Document();
        converter.write(old, document);
        document.remove("links");
        document.remove("linksOverflow");
        var loaded = converter.read(QualityRegistry.Candidate.class, document);
        assertThat(loaded.links()).isEmpty();
        assertThat(loaded.claimant()).isEqualTo("합성 담당자");
        var next = new QualityRegistry.Candidate(old.id(), old.homepage(), old.publicLink(), at, at, old.status(), false, false,
            old.claimOwner(), old.claimant(), old.claimExpiresAt(), null, null, old.history(),
            List.of(new QualityPublicLinks.Link("https://fixture.career.greetinghr.com/ko/o/1/apply", at, at)), true);
        var updated = new Document();
        converter.write(next, updated);
        assertThat(converter.read(QualityRegistry.Candidate.class, updated)).isEqualTo(next);
    }
}
