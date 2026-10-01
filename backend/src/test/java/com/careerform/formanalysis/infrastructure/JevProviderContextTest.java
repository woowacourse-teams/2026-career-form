package com.careerform.formanalysis.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiClient;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.analysis.enabled=true",
    "career-form.analysis.provider=jev",
    "career-form.analysis.jev.api-key=synthetic-test-key",
    "career-form.analysis.jev.data-policy-reviewed=false"
})
@DisplayName("Jev 분석 공급자 컨텍스트")
class JevProviderContextTest {

    @Autowired
    private ApplicationContext context;

    @Test
    @DisplayName("세 분석 포트를 Jev 구현 하나씩으로 구성하고 OpenAI 자동 구성을 끈다")
    void configuresAllPortsWithJevOnly() {
        assertJevPort(FieldMappingResolver.class);
        assertJevPort(ActionResolver.class);
        assertJevPort(InteractionDecisionProvider.class);
        assertThat(context.getBeansOfType(OpenAiClient.class)).isEmpty();
    }

    private <T> void assertJevPort(Class<T> port) {
        var beans = context.getBeansOfType(port);
        assertThat(beans).hasSize(1);
        assertThat(beans.values().iterator().next().getClass().getPackageName())
            .endsWith(".adapter.jev");
    }
}
