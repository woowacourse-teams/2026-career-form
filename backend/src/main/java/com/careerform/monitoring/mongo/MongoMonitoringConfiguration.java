package com.careerform.monitoring.mongo;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.mongodb.autoconfigure.MongoClientSettingsBuilderCustomizer;
import org.springframework.boot.mongodb.autoconfigure.MongoConnectionDetails;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoTemplate;

@Configuration(proxyBeanMethods = false)
class MongoMonitoringConfiguration {

    @Bean
    MongoClientSettingsBuilderCustomizer observeMongoDriver(MeterRegistry registry,
        MongoConnectionDetails details, @Value("${management.metrics.tags.env:local}") String environment) {
        var metrics = new MongoMetrics(registry);
        var commands = new MongoCommandMetrics(metrics, environment, details.getConnectionString().getDatabase());
        var pools = new MongoPoolMetrics(metrics);
        return settings -> settings.addCommandListener(commands)
            .applyToConnectionPoolSettings(pool -> pool.addConnectionPoolListener(pools));
    }

    @Bean
    static BeanPostProcessor observeMongoOperations(ObjectProvider<MeterRegistry> registries,
        @Value("${management.metrics.tags.env:local}") String environment) {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String beanName) {
                if (bean instanceof MongoTemplate template) {
                    return new MongoOperationObservation(new MongoMetrics(registries.getObject()), environment).proxy(template);
                }
                return bean;
            }
        };
    }
}
