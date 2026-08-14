package com.careerform.support;

public final class MongoTestProperties {

    public static final String VALID_URI =
            "mongodb://mongo-test.invalid:27017/career-form-test";
    public static final String VALID_URI_ENVIRONMENT_PROPERTY =
            "SPRING_MONGODB_URI=" + VALID_URI;
    public static final String VALID_URI_COMMAND_LINE_PROPERTY =
            "--spring.mongodb.uri=" + VALID_URI;
    public static final String MONGODB_HEALTH_DISABLED_PROPERTY =
            "management.health.mongodb.enabled=false";
    public static final String MONGODB_HEALTH_DISABLED_COMMAND_LINE_PROPERTY =
            "--" + MONGODB_HEALTH_DISABLED_PROPERTY;
    public static final String UNAVAILABLE_URI_ENVIRONMENT_PROPERTY =
            "SPRING_MONGODB_URI=mongodb://127.0.0.1:1/career-form-test"
                    + "?connectTimeoutMS=100&serverSelectionTimeoutMS=100";

    private MongoTestProperties() {
    }
}
