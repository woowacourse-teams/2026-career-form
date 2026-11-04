package com.careerform.address;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.careerform.formanalysis.infrastructure.persistence.mongo.FormAnalysisCompanyMongoRepository;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test?serverSelectionTimeoutMS=200",
    "career-form.llm.enabled=false",
    "management.health.mongodb.enabled=false",
    "career-form.address.juso.api-key=",
    "career-form.address.juso.base-url=http://127.0.0.1:1/unused",
    "career-form.address.rate-limit.max-requests=2",
    "career-form.address.rate-limit.window=1h"
})
@AutoConfigureMockMvc
@MockitoBean(name = "startupPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@MockitoBean(name = "hplaceFormPolicySeeder", types = org.springframework.boot.ApplicationRunner.class)
@DisplayName("승인키 없이 시작한 주소 검색 API")
class AddressSearchUnconfiguredContextTest {
    private static final String BODY = "{\"query\":\"합성로\"}";

    @Autowired private MockMvc mvc;
    @MockitoBean private FormAnalysisCompanyMongoRepository companies;

    private org.springframework.test.web.servlet.ResultActions search(String client) throws Exception {
        return mvc.perform(post("/api/v1/address/search").contentType(MediaType.APPLICATION_JSON).content(BODY)
            .with(request -> {
                request.setRemoteAddr(client);
                return request;
            }));
    }

    @Test
    @DisplayName("승인키가 없어도 애플리케이션은 시작하고 검색은 정해진 503을 돌려준다")
    void bootsAndReportsNotConfigured() throws Exception {
        search("192.0.2.1").andExpect(status().isServiceUnavailable())
            .andExpect(content().json("{\"error\":\"ADDRESS_SEARCH_NOT_CONFIGURED\"}"));
    }

    @Test
    @DisplayName("클라이언트별 한도를 넘으면 429와 Retry-After를 돌려주고 다른 클라이언트는 계속 처리한다")
    void limitsPerClientAddress() throws Exception {
        search("192.0.2.2").andExpect(status().isServiceUnavailable());
        search("192.0.2.2").andExpect(status().isServiceUnavailable());

        search("192.0.2.2").andExpect(status().isTooManyRequests())
            .andExpect(header().string("Retry-After", "3600"))
            .andExpect(content().json("{\"error\":\"RATE_LIMITED\"}"));
        search("192.0.2.3").andExpect(status().isServiceUnavailable());
    }
}
