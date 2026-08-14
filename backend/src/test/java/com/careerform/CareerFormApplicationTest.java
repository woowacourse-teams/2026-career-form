package com.careerform;

import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ConfigurableApplicationContext;

@SpringBootTest(properties = {
    "SPRING_MONGODB_URI=mongodb://mongo-test.invalid:27017/career-form-test",
    "management.health.mongodb.enabled=false"
})
class CareerFormApplicationTest {

    @Test
    void contextLoads() {
    }

    @Test
    void mainMethodStartsApplication() {
        try (ConfigurableApplicationContext context = SpringApplication
                .from(CareerFormApplication::main)
                .run(
                        "--spring.main.web-application-type=none",
                        "--spring.mongodb.uri=mongodb://mongo-test.invalid:27017/career-form-test",
                        "--management.health.mongodb.enabled=false")
                .getApplicationContext()) {
            assertTrue(context.isActive());
        }
    }
}
