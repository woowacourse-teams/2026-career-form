package com.careerform.monitoring.mongo;

import java.util.Set;
import java.util.concurrent.TimeUnit;

import org.aopalliance.intercept.MethodInterceptor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.data.mongodb.core.MongoTemplate;

public final class MongoOperationObservation {

    private static final Logger log = LoggerFactory.getLogger(MongoOperationObservation.class);
    private static final Set<String> OPERATIONS = Set.of("find", "findOne", "findAll", "findById", "save", "insert",
        "insertAll", "remove", "updateFirst", "updateMulti", "upsert", "findAndModify", "findAndRemove",
        "findAllAndRemove", "findAndReplace", "aggregate", "aggregateStream", "count", "exactCount", "estimatedCount", "exists", "findDistinct");
    private final MongoMetrics metrics;
    private final String environment;
    private final ThreadLocal<Boolean> observing = new ThreadLocal<>();

    public MongoOperationObservation(MongoMetrics metrics, String environment) {
        this.metrics = metrics;
        this.environment = Set.of("dev", "staging", "prod", "local").contains(environment) ? environment : "UNKNOWN";
        for (var operation : OPERATIONS) {
            metrics.initialize("operation", "operation", operation, "success", "failure");
        }
        metrics.initialize("operation", "operation", "OTHER", "success", "failure");
    }

    public Object proxy(MongoTemplate template) {
        var factory = new ProxyFactory(template);
        factory.setProxyTargetClass(true);
        factory.addAdvice((MethodInterceptor) invocation -> {
            var name = invocation.getMethod().getName();
            return OPERATIONS.contains(name) ? observe(name, invocation::proceed) : invocation.proceed();
        });
        return factory.getProxy();
    }

    public Object observe(String operation, Invocation invocation) throws Throwable {
        if (Boolean.TRUE.equals(observing.get())) {
            return invocation.proceed();
        }
        var safeOperation = operationName(operation);
        var previousOperation = MDC.get("dbOperation");
        MDC.put("dbOperation", safeOperation);
        observing.set(true);
        var started = System.nanoTime();
        var outcome = "success";
        var failure = "none";
        try {
            return invocation.proceed();
        } catch (Throwable exception) {
            outcome = "failure";
            failure = exception.getClass().getSimpleName().replaceAll("[^a-zA-Z0-9]", "");
            throw exception;
        } finally {
            observing.remove();
            if (previousOperation == null) {
                MDC.remove("dbOperation");
            } else {
                MDC.put("dbOperation", previousOperation);
            }
            var nanos = System.nanoTime() - started;
            metrics.record("operation", "operation", safeOperation, outcome, nanos);
            var requestId = MDC.get("requestId");
            var safeId = requestId != null && requestId.matches("[0-9a-fA-F-]{36}") ? requestId : "none";
            log.info("DB_OPERATION env={} operation={} outcome={} durationMs={} failure={} requestId={}",
                environment, safeOperation, outcome, TimeUnit.NANOSECONDS.toMillis(nanos), failure, safeId);
        }
    }

    @FunctionalInterface
    public interface Invocation {
        Object proceed() throws Throwable;
    }

    static String operationName(String operation) {
        return operation != null && OPERATIONS.contains(operation) ? operation : "OTHER";
    }
}
