package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;

class StartupPolicySeederTest {
    @ParameterizedTest
    @ValueSource(strings = {"local", "dev", "staging", "prod"})
    void registersVerifiedPoliciesBeforeCompaniesInEveryDeploymentProfile(String profile) throws Exception {
        var mongo = mock(MongoTemplate.class);
        try (var context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().setActiveProfiles(profile);
            context.registerBean(MongoTemplate.class, () -> mongo);
            context.register(StartupPolicySeeder.class);
            context.refresh();
            context.getBean(StartupPolicySeeder.class).run(null);
        }
        var documents = ArgumentCaptor.forClass(Document.class);
        var order = inOrder(mongo);
        order.verify(mongo, times(3)).insert(documents.capture(), eq("form_analysis_policies"));
        assertThat(documents.getAllValues()).extracting(d -> d.get("version", Number.class).longValue())
            .containsExactly(37L, 24L, 17L);
        order.verify(mongo).insert(any(Document.class), eq("execution_provider_policies"));
        order.verify(mongo, times(3)).insert(any(Document.class), eq("form_analysis_companies"));
    }

    @Test
    void restartPreservesExistingDocumentsAndActiveVersions() throws Exception {
        var mongo = mock(MongoTemplate.class);
        when(mongo.exists(any(Query.class), anyString())).thenReturn(true);
        new StartupPolicySeeder(mongo).run(null);
        verify(mongo, never()).insert(any(Document.class), anyString());
        verify(mongo, times(7)).exists(any(Query.class), anyString());
        verifyNoMoreInteractions(mongo);
    }

    @Test
    void failedPolicyInsertDoesNotActivateCompany() {
        var mongo = mock(MongoTemplate.class);
        when(mongo.insert(any(Document.class), eq("form_analysis_policies")))
            .thenThrow(new IllegalStateException("unavailable"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> new StartupPolicySeeder(mongo).run(null))
            .isInstanceOf(IllegalStateException.class);
        verify(mongo, never()).insert(any(Document.class), eq("form_analysis_companies"));
    }
    @Test
    void persistedSnapshotCanBeReadByTheApplicationConverter() throws Exception {
        Document seed;
        try (var source = getClass().getResourceAsStream("/policies/startup-policy-seed-v1.json")) {
            seed = Document.parse(new String(source.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
        }
        try (var context = new AnnotationConfigApplicationContext()) {
            context.register(MongoPolicyMappingConfiguration.class);
            context.registerBean(org.springframework.data.mongodb.core.convert.MappingMongoConverter.class, () ->
                new org.springframework.data.mongodb.core.convert.MappingMongoConverter(
                    org.springframework.data.mongodb.core.convert.NoOpDbRefResolver.INSTANCE,
                    new org.springframework.data.mongodb.core.mapping.MongoMappingContext()));
            context.refresh();
            var converter = context.getBean(org.springframework.data.mongodb.core.convert.MappingMongoConverter.class);
            for (var bson : seed.getList("policies", Document.class)) {
                var policy = converter.read(FormAnalysisPolicyDocument.class, bson);
                assertThat(policy.fieldRules()).hasSize(bson.getList("fieldRules", Document.class).size());
                assertThat(policy.actionRules()).hasSize(bson.getList("actionRules", Document.class).size());
                assertThat(policy.executionPolicy()).isNotNull();
                var written = new Document();
                converter.write(policy, written);
                assertThat(converter.read(FormAnalysisPolicyDocument.class, written)).isEqualTo(policy);
            }
        }
    }

    @Test
    void toleratesOnlyDuplicateRacesWithAnExistingIdentity() throws Exception {
        var mongo = mock(MongoTemplate.class);
        when(mongo.exists(any(Query.class), anyString())).thenReturn(false, true, true, true, true, true, true, true);
        when(mongo.insert(any(Document.class), eq("form_analysis_policies")))
            .thenThrow(new org.springframework.dao.DuplicateKeyException("concurrent startup"));
        new StartupPolicySeeder(mongo).run(null);
        verify(mongo, times(1)).insert(any(Document.class), eq("form_analysis_policies"));
    }

}
