package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.data.mongodb.core.convert.MappingMongoConverter;
import org.springframework.data.mongodb.core.convert.NoOpDbRefResolver;
import org.springframework.data.mongodb.core.mapping.MongoMappingContext;

class MongoPolicyMappingConfigurationTest {

    @Test
    void preservesDecimalGpaKeysAndBothCompanyPoliciesThroughBsonRoundTrip() {
        var policies = mock(FormAnalysisPolicyMongoRepository.class);
        var captured = ArgumentCaptor.forClass(FormAnalysisPolicyDocument.class);
        new LocalCompanyFormPolicySeeder(mock(FormAnalysisCompanyMongoRepository.class), policies).run(null);
        verify(policies, times(2)).save(captured.capture());

        try (var context = new AnnotationConfigApplicationContext()) {
            context.register(MongoPolicyMappingConfiguration.class);
            context.registerBean(MappingMongoConverter.class, () ->
                new MappingMongoConverter(NoOpDbRefResolver.INSTANCE, new MongoMappingContext()));
            context.refresh();
            var converter = context.getBean(MappingMongoConverter.class);
            for (var policy : captured.getAllValues()) {
                var bson = new Document();
                converter.write(policy, bson);
                assertThat(converter.read(FormAnalysisPolicyDocument.class, bson)).isEqualTo(policy);
                if (policy.companyKey().equals("hyundai")) {
                    var gpa = bson.getList("fieldRules", Document.class).stream()
                        .filter(rule -> "rcdPerf".equals(rule.getString("structuralName")))
                        .findFirst().orElseThrow().get("valueBinding", Document.class);
                    assertThat(gpa.get("optionMap", Document.class))
                        .containsEntry("4.00", "4.0").containsEntry("4.30", "4.3")
                        .containsEntry("4.50", "4.5").containsEntry("100.00", "100");
                    assertThat(gpa.get("optionCodeMap", Document.class))
                        .containsEntry("4.0", "4").containsEntry("4.3", "4.3");
                }
            }
        }
    }
}
