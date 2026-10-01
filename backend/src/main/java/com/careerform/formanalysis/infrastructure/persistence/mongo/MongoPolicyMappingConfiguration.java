package com.careerform.formanalysis.infrastructure.persistence.mongo;

import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.convert.MappingMongoConverter;

@Configuration(proxyBeanMethods = false)
class MongoPolicyMappingConfiguration {

    @Bean
    static BeanPostProcessor preserveLiteralPolicyOptionKeys() {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessBeforeInitialization(Object bean, String beanName) {
                if (bean instanceof MappingMongoConverter converter) {
                    // MongoDB 8 supports literal decimal labels such as "4.30" as map keys.
                    converter.preserveMapKeys(true);
                }
                return bean;
            }
        };
    }
}
