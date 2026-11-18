package com.careerform.profileimport;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.core.io.ClassPathResource;

import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiChoiceModel;
import com.careerform.monitoring.tracing.LangSmithTraceRecorder;
import com.sun.net.httpserver.HttpServer;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** 값 트레이스는 로컬과 스테이징에서만 켜고 운영 프로필에서는 설정과 관계없이 끈다. 원문은 모두 합성값이다. */
@ExtendWith(OutputCaptureExtension.class)
@DisplayName("이력서 초안 값 트레이스 설정")
class ProfileImportTraceValuesTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String TEXT = "합성 이력서 SYNTHETIC-TRACE-469\n경력: 합성물산 2020-01-02 입사";
    private static final String DRAFT = "{\"careers\":[{\"sectionId\":\"career\",\"values\":{\"companyName\":\"합성물산\","
        + "\"startDate\":\"2020-01-02\"}}]}";

    private final BlockingQueue<JsonNode> runs = new LinkedBlockingQueue<>();
    private HttpServer receiver;
    private LangSmithTraceRecorder recorder;

    @AfterEach
    void close() {
        if (recorder != null) recorder.close();
        if (receiver != null) receiver.stop(0);
    }

    private LangSmithTraceRecorder recorder() throws IOException {
        receiver = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        receiver.createContext("/api/v1/runs", exchange -> {
            runs.add(JSON.readTree(exchange.getRequestBody().readAllBytes()));
            var body = "{}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        receiver.start();
        recorder = new LangSmithTraceRecorder(true, "SYNTHETIC-LANGSMITH-KEY", "http://127.0.0.1:"
            + receiver.getAddress().getPort(), "cf469-values", 1000, 4);
        return recorder;
    }

    private ProfileImportService service(boolean traceValues) throws IOException {
        var schema = new ProfileDraftSchema();
        var reply = JSON.createObjectNode();
        reply.put("model", "gpt-synthetic-469");
        var choice = reply.putArray("choices").addObject();
        choice.put("finish_reason", "stop");
        choice.putObject("message").put("content", DRAFT);
        OpenAiChoiceModel.Transport transport = body -> new OpenAiChoiceModel.Reply(200, reply.toString());
        return new ProfileImportService(new ResumeExtractionModel(transport, "gpt-synthetic-469", "none", 1024, schema),
            schema, 20_000, "gpt-synthetic-469", null, recorder(), traceValues);
    }

    private JsonNode run() throws InterruptedException {
        var run = runs.poll(5, TimeUnit.SECONDS);
        assertThat(run).as("trace delivered").isNotNull();
        return run;
    }

    @Test
    @DisplayName("설정이 꺼져 있으면 트레이스에 원문과 추출 값이 없고 비식별 구조 값만 있다")
    void offKeepsTraceDeidentified(CapturedOutput output) throws Exception {
        var outcome = service(false).importResume(TEXT);

        assertThat(outcome.result()).isEqualTo(ProfileImportService.Result.OK);
        var trace = run();
        assertThat(trace.path("inputs").path("inputChars").asInt()).isEqualTo(TEXT.length());
        assertThat(trace.path("outputs").path("extracted").path("careers").asInt()).isEqualTo(1);
        assertThat(trace.path("inputs").has("text")).isFalse();
        assertThat(trace.path("outputs").has("profile")).isFalse();
        assertThat(trace.path("outputs").path("valuesIncluded").asBoolean(true)).isFalse();
        assertThat(trace.toString()).doesNotContain("SYNTHETIC-TRACE-469", "합성물산");
        assertThat(output.getAll()).doesNotContain("SYNTHETIC-TRACE-469", "합성물산");
    }

    @Test
    @DisplayName("설정이 켜져 있으면 트레이스에서 입력 글자와 추출 값을 볼 수 있고 애플리케이션 로그에는 여전히 없다")
    void onAddsTextAndValuesToTraceOnly(CapturedOutput output) throws Exception {
        var outcome = service(true).importResume("  " + TEXT + "  ");

        assertThat(outcome.result()).isEqualTo(ProfileImportService.Result.OK);
        var trace = run();
        assertThat(trace.path("inputs").path("text").asString()).isEqualTo(TEXT);
        assertThat(trace.path("inputs").path("inputChars").asInt()).isEqualTo(TEXT.length());
        assertThat(trace.path("outputs").path("profile").path("careers").get(0).path("values").path("companyName")
            .asString()).isEqualTo("합성물산");
        assertThat(trace.path("outputs").path("extracted").path("careers").asInt()).isEqualTo(1);
        assertThat(trace.path("outputs").path("valuesIncluded").asBoolean()).isTrue();
        assertThat(output.getAll()).contains("PROFILE_IMPORT_RESULT result=OK")
            .doesNotContain("SYNTHETIC-TRACE-469", "합성물산");
    }

    @Test
    @DisplayName("운영 프로필에서는 설정을 켜도 값 트레이스가 꺼지고, 로컬과 스테이징 프로필에서만 설정대로 켜진다")
    void productionProfileForcesValuesOff() {
        var runner = new ApplicationContextRunner().withUserConfiguration(ProfileImportConfiguration.class)
            .withPropertyValues("career-form.profile-import.openai.api-key=SYNTHETIC-KEY");

        runner.withPropertyValues("career-form.profile-import.trace-values=true")
            .withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
            .run(context -> assertThat(context.getBean(ProfileImportService.class).tracesValues()).isFalse());
        runner.withPropertyValues("career-form.profile-import.trace-values=true")
            .withInitializer(context -> context.getEnvironment().setActiveProfiles("staging", "prod"))
            .run(context -> assertThat(context.getBean(ProfileImportService.class).tracesValues()).isFalse());
        runner.withPropertyValues("career-form.profile-import.trace-values=true")
            .withInitializer(context -> context.getEnvironment().setActiveProfiles("staging"))
            .run(context -> assertThat(context.getBean(ProfileImportService.class).tracesValues()).isTrue());
        runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("local"))
            .run(context -> assertThat(context.getBean(ProfileImportService.class).tracesValues()).isFalse());
    }

    @Test
    @DisplayName("기본 설정은 끔이고 로컬과 스테이징 프로필 설정 파일만 값 트레이스를 켠다")
    void profileFilesEnableOnlyLocalAndStaging() throws IOException {
        assertThat(traceValues("application.yml")).isEqualTo("false");
        assertThat(traceValues("application-local.yml")).isEqualTo("true");
        assertThat(traceValues("application-staging.yml")).isEqualTo("true");
        assertThat(traceValues("application-dev.yml")).isNull();
        assertThat(traceValues("application-prod.yml")).isNull();
    }

    private static String traceValues(String file) throws IOException {
        for (var source : new YamlPropertySourceLoader().load(file, new ClassPathResource(file))) {
            var value = source.getProperty("career-form.profile-import.trace-values");
            if (value != null) return value.toString();
        }
        return null;
    }
}
