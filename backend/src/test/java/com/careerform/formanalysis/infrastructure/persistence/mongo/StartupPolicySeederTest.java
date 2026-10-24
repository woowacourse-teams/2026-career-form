package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

@ExtendWith(OutputCaptureExtension.class)
class StartupPolicySeederTest {
    private static final String POLICIES = "form_analysis_policies";
    private static final String COMPANIES = "form_analysis_companies";

    @ParameterizedTest
    @ValueSource(strings = {"local", "dev", "staging", "prod"})
    void registersVerifiedPoliciesBeforeCompaniesInEveryDeploymentProfile(String profile) throws Exception {
        var mongo = mock(MongoTemplate.class);
        runInProfile(profile, mongo);
        var documents = ArgumentCaptor.forClass(Document.class);
        var order = inOrder(mongo);
        order.verify(mongo, times(6)).insert(documents.capture(), eq(POLICIES));
        assertThat(documents.getAllValues()).extracting(d -> d.get("version", Number.class).longValue())
            .containsExactly(37L, 38L, 24L, 25L, 17L, 18L);
        order.verify(mongo).insert(any(Document.class), eq("execution_provider_policies"));
        order.verify(mongo, times(3)).insert(any(Document.class), eq(COMPANIES));
    }

    @Test
    void restartWithMatchingActiveVersionsWritesNothing() throws Exception {
        var mongo = mock(MongoTemplate.class);
        when(mongo.exists(any(Query.class), anyString())).thenReturn(true);
        existingCompanies(mongo, 38L, 25L, 18L);
        new StartupPolicySeeder(mongo).run(null);
        verify(mongo, never()).insert(any(Document.class), anyString());
        verify(mongo, never()).updateFirst(any(Query.class), any(Update.class), anyString());
    }

    // The deployed commit's seed owns the active version: a newer seed raises it.
    @ParameterizedTest
    @ValueSource(strings = {"local", "dev", "staging", "prod"})
    void raisesActiveVersionToTheSeedInEveryProfile(String profile, CapturedOutput output) throws Exception {
        var mongo = mock(MongoTemplate.class);
        when(mongo.exists(any(Query.class), anyString())).thenReturn(true);
        existingCompanies(mongo, 37L, 24L, 17L);
        runInProfile(profile, mongo);
        assertThat(activeVersionUpdates(mongo)).containsExactly(38L, 25L, 18L);
        verify(mongo, never()).insert(any(Document.class), eq(COMPANIES));
        assertThat(output.getOut()).contains("POLICY_ACTIVE_VERSION", "company=sk", "from=37", "to=38")
            .contains("company=hyundai", "from=24", "to=25")
            .contains("company=greeting", "from=17", "to=18");
    }

    // Redeploying an older commit rolls the active version back to that commit's seed.
    @Test
    void lowersActiveVersionToTheSeedOnRollback() throws Exception {
        var mongo = mock(MongoTemplate.class);
        when(mongo.exists(any(Query.class), anyString())).thenReturn(true);
        existingCompanies(mongo, 40L, 26L, 20L);
        new StartupPolicySeeder(mongo).run(null);
        assertThat(activeVersionUpdates(mongo)).containsExactly(38L, 25L, 18L);
    }

    @Test
    void keepsActiveVersionAndWarnsWhenTheSeedPolicyIsMissing(CapturedOutput output) throws Exception {
        var mongo = mock(MongoTemplate.class);
        when(mongo.exists(any(Query.class), anyString())).thenReturn(true);
        when(mongo.exists(argThat(q -> q != null && q.getQueryObject().toJson().contains("\"version\": 38")), eq(POLICIES)))
            .thenReturn(false);
        existingCompanies(mongo, 37L, 25L, 17L);
        new StartupPolicySeeder(mongo).run(null);
        assertThat(activeVersionUpdates(mongo)).containsExactly(18L);
        assertThat(output.getOut()).contains("POLICY_ACTIVE_VERSION", "company=sk", "missing-policy", "to=38");
    }

    @Test
    void failedPolicyInsertDoesNotActivateCompany() {
        var mongo = mock(MongoTemplate.class);
        when(mongo.insert(any(Document.class), eq(POLICIES)))
            .thenThrow(new IllegalStateException("unavailable"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> new StartupPolicySeeder(mongo).run(null))
            .isInstanceOf(IllegalStateException.class);
        verify(mongo, never()).insert(any(Document.class), eq(COMPANIES));
        verify(mongo, never()).updateFirst(any(Query.class), any(Update.class), eq(COMPANIES));
    }

    @Test
    void persistedSnapshotCanBeReadByTheApplicationConverter() throws Exception {
        var seed = new StartupPolicySeed().document();
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
    void seedListsEveryCompanyWithItsActiveVersionAndAPolicyForIt() {
        var seed = new StartupPolicySeed();
        assertThat(seed.companies()).extracting(StartupPolicySeed.Company::companyKey)
            .containsExactly("sk", "hyundai", "greeting");
        for (var company : seed.companies())
            assertThat(seed.hasPolicy(company.companyKey(), company.activePolicyVersion()))
                .as("seed policy for %s v%d", company.companyKey(), company.activePolicyVersion()).isTrue();
    }

    @Test
    void toleratesOnlyDuplicateRacesWithAnExistingIdentity() throws Exception {
        var mongo = mock(MongoTemplate.class);
        when(mongo.exists(any(Query.class), anyString())).thenReturn(false, true, true, true, true, true, true, true, true);
        when(mongo.insert(any(Document.class), eq(POLICIES)))
            .thenThrow(new org.springframework.dao.DuplicateKeyException("concurrent startup"));
        new StartupPolicySeeder(mongo).run(null);
        verify(mongo, times(1)).insert(any(Document.class), eq(POLICIES));
    }

    private static void runInProfile(String profile, MongoTemplate mongo) throws Exception {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().setActiveProfiles(profile);
            context.registerBean(MongoTemplate.class, () -> mongo);
            context.register(StartupPolicySeed.class, StartupPolicySeeder.class);
            context.refresh();
            context.getBean(StartupPolicySeeder.class).run(null);
        }
    }

    // Companies already in the database, in seed order (sk, hyundai, greeting).
    private static void existingCompanies(MongoTemplate mongo, long sk, long hyundai, long greeting) {
        var keys = new String[] {"sk", "hyundai", "greeting"};
        var versions = new long[] {sk, hyundai, greeting};
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var document = new Document("companyKey", key).append("activePolicyVersion", versions[i]);
            when(mongo.findOne(argThat(q -> q != null && q.getQueryObject().toJson().contains("\"companyKey\": \"" + key + "\"")),
                eq(Document.class), eq(COMPANIES))).thenReturn(document);
        }
    }

    private static java.util.List<Long> activeVersionUpdates(MongoTemplate mongo) {
        var updates = ArgumentCaptor.forClass(Update.class);
        verify(mongo, atLeast(0)).updateFirst(any(Query.class), updates.capture(), eq(COMPANIES));
        return updates.getAllValues().stream()
            .map(u -> ((Document) u.getUpdateObject().get("$set")).get("activePolicyVersion", Number.class).longValue())
            .toList();
    }
}
