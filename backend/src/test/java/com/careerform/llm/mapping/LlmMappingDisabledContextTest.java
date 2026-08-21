package com.careerform.llm.mapping;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=false"
})
@AutoConfigureMockMvc
class LlmMappingDisabledContextTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void startsWithoutApiKeyAndDoesNotExposeTheEndpoint() throws Exception {
        mockMvc.perform(post("/api/v1/llm/mappings")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"contextFields\":[],\"targetFields\":[]}"))
            .andExpect(status().isNotFound());
    }
}
