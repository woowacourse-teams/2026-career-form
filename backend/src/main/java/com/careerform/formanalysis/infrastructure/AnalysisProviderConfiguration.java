package com.careerform.formanalysis.infrastructure;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.Environment;
import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
@Configuration(proxyBeanMethods = false)
public class AnalysisProviderConfiguration {
    @Bean
    AnalysisProviderSelection analysisProviderSelection(Environment environment) {
        return AnalysisProviderSelection.from(environment);
    }

    @Bean
    SmartInitializingSingleton analysisProviderContract(Environment environment, ApplicationContext context) {
        return () -> {
            var selected = AnalysisProviderSelection.from(environment);
            if (!selected.enabled()) return;
            for (Class<?> port : new Class<?>[] {FieldMappingResolver.class, ActionResolver.class, InteractionDecisionProvider.class}) {
                var beans = context.getBeansOfType(port);
                if (beans.size() != 1 ||
                    beans.values().stream().anyMatch(bean -> !bean.getClass().getPackageName().endsWith(".adapter." + selected.provider())))
                    throw new IllegalStateException("Incomplete or mixed analysis provider configuration");
            }
        };
    }
}
