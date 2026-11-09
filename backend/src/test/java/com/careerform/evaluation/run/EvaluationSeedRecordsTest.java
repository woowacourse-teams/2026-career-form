package com.careerform.evaluation.run;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.bson.Document;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;

@DisplayName("저장소에 담은 평가 기록")
class EvaluationSeedRecordsTest {

    private static Resource file(String... lines) {
        return new ByteArrayResource(String.join("\n", lines).getBytes(StandardCharsets.UTF_8));
    }

    @Test
    @DisplayName("평가 기록 컬렉션이 아니면 넣지 않는다")
    void rejectsOtherCollections() {
        assertThatThrownBy(() -> EvaluationSeedRecords.read(file(
            "{\"collection\":\"profiles\",\"document\":{\"_id\":\"a\"}}")))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("끝나지 않은 실행은 넣지 않는다(작업자가 다시 돌리면 비용이 든다)")
    void rejectsUnfinishedRuns() {
        assertThatThrownBy(() -> EvaluationSeedRecords.read(file(
            "{\"collection\":\"evaluation_runs\",\"document\":{\"_id\":\"a\",\"status\":\"QUEUED\"}}")))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("담아 둔 기록은 끝난 실행이고 실행마다 호출 결과가 있으며, 실행은 파일 끝에 있어 결과보다 먼저 보이지 않는다")
    void bundledRecordsAreComplete() throws Exception {
        List<Resource> files = EvaluationSeedRecords.bundled();
        assertThat(files).isNotEmpty();
        for (Resource bundled : files) {
            List<EvaluationSeedRecords.Line> lines = EvaluationSeedRecords.read(bundled);
            List<Document> runs = lines.stream().filter(line -> line.collection().equals(MongoRunStore.RUNS))
                .map(EvaluationSeedRecords.Line::document).toList();
            assertThat(runs).isNotEmpty();
            int firstRun = lines.size() - runs.size();
            assertThat(lines.subList(firstRun, lines.size())).allMatch(line -> line.collection().equals(MongoRunStore.RUNS));
            // 내보낼 때 숫자 형식이 바뀌면(1.0 -> 1) 저장소가 읽지 못해 목록 전체가 깨지므로 실제로 읽어 본다.
            lines.stream().filter(line -> line.collection().equals(MongoResultStore.RESULTS))
                .forEach(line -> assertThat(MongoResultStore.fromDocument(line.document()).runId()).isNotBlank());
            runs.forEach(run -> assertThat(MongoRunStore.fromDocument(run).id()).isEqualTo(run.get("_id")));
            for (Document run : runs) {
                assertThat(lines).anyMatch(line -> line.collection().equals(MongoResultStore.RESULTS)
                    && run.get("_id").equals(line.document().get("runId")));
                assertThat(run).doesNotContainKey("activeSlot");
                // 자동 평가는 입력이 기록된 실행만 비교하므로, 입력이 없는 기준 기록은 첫 자동 평가를 건너뛰게 하지 않는다.
                assertThat(run.get("versions", Document.class).get("inputs", new Document()).isEmpty()).isTrue();
            }
        }
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "EVALUATION_TEST_MONGO_URI", matches = "mongodb://127\\.0\\.0\\.1:[0-9]+.*")
    @DisplayName("없는 기록만 넣고 이미 있는 기록은 건드리지 않으며, 날짜 같은 형식을 그대로 복원한다")
    void insertsOnlyMissing() {
        try (MongoClient client = MongoClients.create(System.getenv("EVALUATION_TEST_MONGO_URI"))) {
            MongoTemplate mongo = new MongoTemplate(client, "cf356_test_" + UUID.randomUUID().toString().replace("-", ""));
            try {
                Resource records = file(
                    "{\"collection\":\"evaluation_call_results\",\"document\":{\"_id\":{\"$oid\":\"65a000000000000000000001\"},\"runId\":\"r\",\"repetition\":1,\"caseId\":\"c\",\"order\":0}}",
                    "{\"collection\":\"evaluation_runs\",\"document\":{\"_id\":\"r\",\"status\":\"COMPLETED\",\"requestedAt\":{\"$date\":{\"$numberLong\":\"1700000000000\"}}}}",
                    "");
                EvaluationSeedRecords seeds = new EvaluationSeedRecords(mongo, List.of(records));

                assertThat(seeds.insertMissing()).isEqualTo(2);
                Document run = mongo.getCollection("evaluation_runs").find().first();
                assertThat(run.get("requestedAt")).isInstanceOf(java.util.Date.class);

                mongo.getCollection("evaluation_runs").updateOne(new Document("_id", "r"), new Document("$set", new Document("status", "PARTIAL")));
                assertThat(seeds.insertMissing()).isZero();
                assertThat(mongo.getCollection("evaluation_runs").find().first().getString("status")).isEqualTo("PARTIAL");
            }
            finally {
                mongo.getDb().drop();
            }
        }
    }
}
