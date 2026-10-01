package com.careerform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;

import tools.jackson.databind.cfg.CoercionAction;
import tools.jackson.databind.cfg.CoercionInputShape;
import tools.jackson.databind.type.LogicalType;

@SpringBootApplication
public class CareerFormApplication {

    public static void main(String[] args) {
        SpringApplication.run(CareerFormApplication.class, args);
    }

    @Bean
    JsonMapperBuilderCustomizer rejectNonStringJsonForTextFields() {
        return builder -> builder.withCoercionConfig(LogicalType.Textual, config -> {
            config.setCoercion(CoercionInputShape.Integer, CoercionAction.Fail);
            config.setCoercion(CoercionInputShape.Float, CoercionAction.Fail);
            config.setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail);
        });
    }
}
