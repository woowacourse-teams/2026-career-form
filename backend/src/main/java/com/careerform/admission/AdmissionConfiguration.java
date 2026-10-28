package com.careerform.admission;

import java.time.Clock;
import java.time.Duration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import io.micrometer.core.instrument.MeterRegistry;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@org.springframework.context.annotation.Conditional(AdmissionAvailableCondition.class)
public class AdmissionConfiguration {
    @Bean public AdmissionSettings admissionSettings(Environment environment) {
        return new AdmissionSettings(number(environment, "user-hourly", 100), number(environment, "install-minute", 60),
            number(environment, "global-hourly", 10000), number(environment, "concurrency", 20), number(environment, "waiting", 100),
            number(environment, "install-active", 10), Duration.ofMillis(number(environment, "queue-wait-ms", 5000)),
            Duration.ofMillis(number(environment, "request-timeout-ms", 55000)), Duration.ofMillis(number(environment, "reservation-timeout-ms", 120000)));
    }
    @Bean public CredentialCrypto admissionCrypto(Environment environment) {
        return new CredentialCrypto(environment.getRequiredProperty("career-form.admission.encryption-key"));
    }
    @Bean public TrustedClientAddress admissionAddresses(Environment environment) {
        return new TrustedClientAddress(environment.getRequiredProperty("career-form.admission.trusted-proxies"));
    }
    @Bean public MongoInstallStore admissionInstalls(MongoTemplate mongo) {
        var store = new MongoInstallStore(new AdmissionMongoTemplate(mongo));
        store.ensureIndexes();
        return store;
    }
    @Bean public MongoUsageStore admissionUsage(MongoTemplate mongo) {
        var store = new MongoUsageStore(new AdmissionMongoTemplate(mongo));
        store.ensureIndexes();
        return store;
    }
    @Bean public UsageLedger admissionLedger(MongoUsageStore store, AdmissionSettings settings) { return new UsageLedger(store, Clock.systemUTC(), settings); }
    @Bean public InstallService installService(MongoInstallStore store, CredentialCrypto crypto, UsageLedger ledger, Environment environment) {
        return new InstallService(store, crypto, Clock.systemUTC(), (address, operation) -> {
            var owner = "issuance:" + crypto.digest("network", address);
            UsageLedger.Ticket shortWindow = null;
            try {
                shortWindow = ledger.protection(owner, number(environment, "registration-ten-minutes", 20), 600, operation, "REGISTRATION_LIMIT");
                var hour = ledger.protection(owner, number(environment, "registration-hourly", 100), 3600, operation, "REGISTRATION_LIMIT");
                ledger.commitProtection(shortWindow);
                ledger.commitProtection(hour);
            } catch (AdmissionFailure error) {
                if (shortWindow != null) ledger.settle(shortWindow, false);
                throw error;
            }
        });
    }
    @Bean public ExecutionGate admissionGate(AdmissionSettings settings) { return new ExecutionGate(settings.concurrency(), settings.waiting(), settings.queueWait()); }
    @Bean
    @ConditionalOnProperty(prefix = "career-form.admission", name = "enabled", havingValue = "true")
    public AiAdmission aiAdmission(UsageLedger ledger, ExecutionGate gate, AdmissionSettings settings, MeterRegistry meters) {
        return new AiAdmission(ledger, gate, settings, meters);
    }
    @Bean
    @ConditionalOnProperty(prefix = "career-form.admission", name = "enabled", havingValue = "true")
    public FilterRegistrationBean<AdmissionFilter> admissionFilter(InstallService service, TrustedClientAddress addresses, AdmissionSettings settings) {
        var filter = new FilterRegistrationBean<>(new AdmissionFilter(service, addresses, settings));
        filter.setOrder(-100);
        return filter;
    }
    @Bean public AdmissionMaintenance admissionMaintenance(MongoInstallStore installs, MongoUsageStore usage, MeterRegistry meters) {
        return new AdmissionMaintenance(installs, usage, meters);
    }
    private static int number(Environment environment, String name, int fallback) {
        return environment.getProperty("career-form.admission." + name, Integer.class, fallback);
    }
}
